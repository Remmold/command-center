import { randomUUID } from 'node:crypto'
import type { CreateTerminalRequest, CreateTerminalResult, TerminalAttachment, TerminalInfo } from '../../shared/types'
import { localServers } from '../../shared/localPorts'
import type { PtyManager } from './manager'

/** How many bytes (UTF-8) of a terminal's latest raw output are kept for a view that attaches later. */
export const TAIL_LIMIT = 256 * 1024

interface Chunk {
  text: string
  bytes: number
}

/** The newest `TAIL_LIMIT` bytes of a stream, kept as chunks so appending stays cheap. */
class OutputTail {
  private chunks: Chunk[] = []
  private size = 0

  append(text: string): void {
    const bytes = Buffer.byteLength(text)
    this.chunks.push({ text, bytes })
    this.size += bytes
    while (this.chunks.length > 1 && this.size - this.chunks[0].bytes >= TAIL_LIMIT) {
      this.size -= this.chunks.shift()!.bytes
    }
  }

  text(): string {
    const all = this.chunks.map((c) => c.text).join('')
    if (this.size <= TAIL_LIMIT) return all
    // A cut inside a multi-byte character decodes to U+FFFD; drop it.
    const kept = Buffer.from(all).subarray(-TAIL_LIMIT).toString().replace(/^\uFFFD+/, '')
    this.chunks = [{ text: kept, bytes: Buffer.byteLength(kept) }]
    this.size = this.chunks[0].bytes
    return kept
  }
}

/** Enough of the previous chunk to catch a URL split across two. */
const SERVER_CARRY = 256

interface Entry {
  info: TerminalInfo
  tail: OutputTail
  /** The end of the output before the latest chunk. */
  carry: string
}

function shellBase(kind: TerminalInfo['kind']): string {
  return kind === 'powershell' ? 'pwsh' : kind
}

/** The pool of terminals: each one's pty, its record and its output tail (ADR 0006). */
export class TerminalRegistry {
  private entries = new Map<string, Entry>()
  private changedListeners: ((list: TerminalInfo[]) => void)[] = []
  private dataListeners: ((id: string, data: string) => void)[] = []

  constructor(
    private readonly ptys: PtyManager,
    private readonly now: () => number = Date.now
  ) {
    ptys.onData((id, data) => {
      const entry = this.entries.get(id)
      if (!entry) return
      entry.tail.append(data)
      const found = this.newServers(entry, data)
      for (const cb of this.dataListeners) cb(id, data)
      if (found) this.changed()
    })
    ptys.onExit((id, exitCode) => {
      const entry = this.entries.get(id)
      if (!entry) return
      this.ended(entry, exitCode)
      this.changed()
    })
  }

  list(): TerminalInfo[] {
    return Array.from(this.entries.values(), (e) => e.info)
  }

  runningCount(): number {
    return this.list().filter((t) => t.status === 'running').length
  }

  create(request: CreateTerminalRequest): CreateTerminalResult {
    const id = request.id ?? randomUUID()
    const existing = this.entries.get(id)
    if (existing) return { ok: true, terminal: existing.info }
    const info: TerminalInfo = {
      id,
      workspaceId: request.workspaceId,
      cwd: request.cwd,
      label: request.label ?? request.command ?? this.nextShellLabel(request.workspaceId, request.kind),
      ...(request.command ? { command: request.command } : {}),
      kind: request.kind,
      ...(request.env ? { env: request.env } : {}),
      status: 'running',
      startedAt: this.now()
    }
    const entry: Entry = { info, tail: new OutputTail(), carry: '' }
    this.entries.set(id, entry)
    return this.start(entry)
  }

  attach(id: string): TerminalAttachment | null {
    const entry = this.entries.get(id)
    return entry ? { terminal: entry.info, tail: entry.tail.text() } : null
  }

  write(id: string, data: string): void {
    this.ptys.write(id, data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.ptys.resize(id, cols, rows)
  }

  rename(id: string, label: string): void {
    const entry = this.entries.get(id)
    const trimmed = label.trim()
    if (!entry || !trimmed) return
    entry.info = { ...entry.info, label: trimmed }
    this.changed()
  }

  restart(id: string): CreateTerminalResult {
    const entry = this.entries.get(id)
    if (!entry) return { ok: false, error: 'unknown terminal' }
    void this.ptys.kill(id)
    const { exitCode: _code, endedAt: _ended, servers: _servers, ...rest } = entry.info
    entry.info = { ...rest, status: 'running', startedAt: this.now() }
    entry.tail = new OutputTail()
    entry.carry = ''
    return this.start(entry)
  }

  /** Ends a running terminal's process tree; it stays listed as exited, with its output, so Restart can rerun it. */
  stop(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (entry?.info.status !== 'running') return Promise.resolve()
    const killed = this.ptys.kill(id)
    entry.info = { ...entry.info, status: 'exited', endedAt: this.now() }
    this.changed()
    return killed
  }

  close(id: string): Promise<void> {
    if (!this.entries.delete(id)) return Promise.resolve()
    const killed = this.ptys.kill(id)
    this.changed()
    return killed
  }

  closeAll(): Promise<void> {
    const killed = Array.from(this.entries.keys(), (id) => this.close(id))
    return Promise.all(killed).then(() => undefined)
  }

  onChanged(cb: (list: TerminalInfo[]) => void): () => void {
    this.changedListeners.push(cb)
    return () => {
      this.changedListeners = this.changedListeners.filter((c) => c !== cb)
    }
  }

  onData(cb: (id: string, data: string) => void): () => void {
    this.dataListeners.push(cb)
    return () => {
      this.dataListeners = this.dataListeners.filter((c) => c !== cb)
    }
  }

  /** A start that fails leaves the terminal Exited with the error on screen, so Restart can retry. */
  private start(entry: Entry): CreateTerminalResult {
    const { id, kind, cwd, env, command } = entry.info
    const res = this.ptys.spawn(id, kind, cwd, env, command)
    if (!res.ok) {
      const error = res.error ?? 'could not start the shell'
      entry.tail.append(`\x1b[31m${error}\x1b[0m\r\n`)
      this.ended(entry, -1)
      this.changed()
      return { ok: false, error, terminal: entry.info }
    }
    this.changed()
    return { ok: true, terminal: entry.info }
  }

  private changed(): void {
    const list = this.list()
    for (const cb of this.changedListeners) cb(list)
  }

  /** Adds the servers this chunk names; true when there were new ones. */
  private newServers(entry: Entry, data: string): boolean {
    const text = entry.carry + data
    entry.carry = text.slice(-SERVER_CARRY)
    const known = entry.info.servers ?? []
    const added = localServers(text).filter((s) => !known.some((k) => k.port === s.port))
    if (added.length === 0) return false
    entry.info = { ...entry.info, servers: [...known, ...added] }
    return true
  }

  private ended(entry: Entry, exitCode: number): void {
    entry.info = { ...entry.info, status: 'exited', exitCode, endedAt: this.now() }
  }

  private nextShellLabel(workspaceId: string, kind: TerminalInfo['kind']): string {
    const base = shellBase(kind)
    const same = this.list().filter((t) => t.workspaceId === workspaceId && !t.command && shellBase(t.kind) === base).length
    return same === 0 ? base : `${base} ${same + 1}`
  }
}
