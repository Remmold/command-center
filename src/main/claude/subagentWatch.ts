import { promises as fs, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { agentSettled } from '../../shared/agentSummary'
import { subagentSourceKey, type SubagentItemsSource, type SubagentMeta, type SubagentSource, type SubagentTailEvent } from '../../shared/subagentTail'
import { POLL_MS, readLastItems, TranscriptCursor } from '../observed/tail'
import { agentFiles, type AgentFileCache } from './agentFiles'

const AGENT_FILE = /^agent-([A-Za-z0-9_-]{1,128})\.jsonl$/
const AGENT_META_FILE = /^agent-([A-Za-z0-9_-]{1,128})\.meta\.json$/
const INITIAL_ITEMS = 400
const INITIAL_MAX_BYTES = 8 * 1024 * 1024

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

const FIRST_LINE_MAX_BYTES = 256 * 1024
const PROMPT_ID = /"promptId":"([^"]{1,128})"/
const TIMESTAMP = /"timestamp":"([^"]{1,64})"/

/** The prompt id and time of the file's first line; a first line longer than the read still gives its prompt id, which comes early. */
async function readStart(file: string): Promise<Pick<SubagentMeta, 'promptId' | 'startedAt'>> {
  let handle
  try {
    handle = await fs.open(file, 'r')
    const buffer = Buffer.alloc(FIRST_LINE_MAX_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, FIRST_LINE_MAX_BYTES, 0)
    const text = buffer.subarray(0, bytesRead).toString('utf-8')
    const end = text.indexOf('\n')
    const first = end < 0 ? text : text.slice(0, end)
    const promptId = PROMPT_ID.exec(first)?.[1]
    // The line's own timestamp is its last one; quoted ones can sit inside the message before it.
    const stamp = end < 0 ? undefined : TIMESTAMP.exec(first.slice(Math.max(0, first.lastIndexOf('"timestamp"'))))?.[1]
    const startedAt = stamp ? Date.parse(stamp) : NaN
    return { ...(promptId ? { promptId } : {}), ...(Number.isFinite(startedAt) ? { startedAt } : {}) }
  } catch {
    return {}
  } finally {
    await handle?.close()
  }
}

type MetaFields = Omit<SubagentMeta, 'agentId' | 'promptId' | 'startedAt'>

async function readMetaFile(dir: string, agentId: string): Promise<MetaFields> {
  try {
    const raw = JSON.parse(await fs.readFile(join(dir, `agent-${agentId}.meta.json`), 'utf-8')) as Record<string, unknown>
    const meta: MetaFields = {}
    const agentType = str(raw.agentType)
    const description = str(raw.description)
    const toolUseId = str(raw.toolUseId)
    if (agentType) meta.agentType = agentType
    if (description) meta.description = description
    if (toolUseId) meta.toolUseId = toolUseId
    if (raw.finished === true) meta.finished = true
    return meta
  } catch {
    return {}
  }
}

const startOf = ({ promptId, startedAt }: SubagentMeta): Pick<SubagentMeta, 'promptId' | 'startedAt'> => ({
  ...(promptId ? { promptId } : {}),
  ...(startedAt !== undefined ? { startedAt } : {})
})

const sameMeta = (a: SubagentMeta, b: SubagentMeta): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Settled agents' files are only stat'ed, every this many polls, in case one woke and fs.watch missed it. */
const SETTLED_CHECK_EVERY = 15
/** Folder events come in bursts while agents write; the reads they ask for wait this long to gather them. */
const EVENT_DELAY_MS = 150

interface KnownAgent {
  meta: SubagentMeta
  /** Bytes summarised so far. */
  offset: number
  settled: boolean
}

interface OpenAgent {
  cursor: TranscriptCursor | null
}

/**
 * Follows one session's `subagents/` folder on one timer. Each agent's file is summarised once on first sight;
 * agents still working are re-read for their new bytes on each poll, settled ones only stat'ed now and then.
 * Full items are read only for the agents whose live view is open.
 */
export class SubagentWatcher {
  private agents = new Map<string, KnownAgent>()
  private opened = new Map<string, OpenAgent>()
  private dirty = new Set<string>()
  private dirWatcher: FSWatcher | null = null
  private poll: NodeJS.Timeout | null = null
  private soon: NodeJS.Timeout | null = null
  private soonAll = false
  private running: Promise<void> = Promise.resolve()
  private polls = 0
  private stopped = false

  constructor(
    private readonly dir: string,
    private readonly key: string,
    private readonly emit: (event: SubagentTailEvent) => void,
    private readonly pollMs = POLL_MS,
    private readonly files: AgentFileCache = agentFiles
  ) {}

  start(): void {
    this.queue(() => this.pollAll())
    this.poll = setInterval(() => this.queue(() => this.pollAll()), this.pollMs)
  }

  stop(): void {
    this.stopped = true
    if (this.poll) clearInterval(this.poll)
    if (this.soon) clearTimeout(this.soon)
    this.poll = null
    this.soon = null
    this.dirWatcher?.close()
    this.dirWatcher = null
    this.agents.clear()
    this.opened.clear()
  }

  /** The agents whose files are re-read on each poll. */
  followed(): string[] {
    return [...this.agents].flatMap(([id, a]) => (a.settled ? [] : [id]))
  }

  /** Sends the agent's items, then its new ones on each poll while it stays open. */
  open(agentId: string): void {
    if (this.stopped) return
    const open: OpenAgent = { cursor: null }
    this.opened.set(agentId, open)
    this.queue(() => this.readOpen(agentId, open))
  }

  close(agentId: string): void {
    this.opened.delete(agentId)
  }

  private queue(job: () => Promise<void>): void {
    this.running = this.running.then(() => (this.stopped ? undefined : job())).catch((err) => console.error('[subagents] read failed', err))
  }

  private file(agentId: string): string {
    return join(this.dir, `agent-${agentId}.jsonl`)
  }

  private async pollAll(): Promise<void> {
    let names: string[]
    try {
      names = await fs.readdir(this.dir)
    } catch {
      return
    }
    this.watchDir()
    const statSettled = ++this.polls % SETTLED_CHECK_EVERY === 0
    const wasDirty = [...this.dirty]
    const listed = new Set<string>()
    for (const name of names) {
      const agentId = AGENT_FILE.exec(name)?.[1]
      if (!agentId || this.stopped) continue
      listed.add(agentId)
      const known = this.agents.get(agentId)
      const dirty = this.dirty.delete(agentId)
      if (!known) await this.add(agentId)
      else if (!known.settled || dirty || (statSettled && (await this.grewSince(agentId, known.offset)))) await this.refresh(agentId, known)
    }
    // Events for files that are gone; ones that came in during the loop stay for their own pass.
    for (const agentId of wasDirty) if (!listed.has(agentId)) this.dirty.delete(agentId)
    for (const [agentId, open] of this.opened) await this.readOpen(agentId, open)
  }

  private async pollDirty(): Promise<void> {
    const ids = [...this.dirty]
    this.dirty.clear()
    for (const agentId of ids) {
      if (this.stopped) return
      const known = this.agents.get(agentId)
      if (known) await this.refresh(agentId, known)
      else await this.add(agentId)
      const open = this.opened.get(agentId)
      if (open) await this.readOpen(agentId, open)
    }
  }

  private async grewSince(agentId: string, offset: number): Promise<boolean> {
    try {
      return (await fs.stat(this.file(agentId))).size !== offset
    } catch {
      return false
    }
  }

  private watchDir(): void {
    if (this.dirWatcher || this.stopped) return
    try {
      this.dirWatcher = watch(this.dir, (_event, name) => this.changed(typeof name === 'string' ? name : null))
      this.dirWatcher.on('error', () => {
        this.dirWatcher?.close()
        this.dirWatcher = null
      })
    } catch {
      this.dirWatcher = null
    }
  }

  private changed(name: string | null): void {
    const agentId = name === null ? undefined : (AGENT_FILE.exec(name)?.[1] ?? AGENT_META_FILE.exec(name)?.[1])
    if (name !== null && !agentId) return
    if (agentId) this.dirty.add(agentId)
    else this.soonAll = true
    if (this.soon || this.stopped) return
    this.soon = setTimeout(() => {
      this.soon = null
      const all = this.soonAll
      this.soonAll = false
      this.queue(() => (all ? this.pollAll() : this.pollDirty()))
    }, EVENT_DELAY_MS)
  }

  private async add(agentId: string): Promise<void> {
    let read
    try {
      read = await this.files.read(this.file(agentId))
    } catch {
      return
    }
    const meta: SubagentMeta = { agentId, ...(await readMetaFile(this.dir, agentId)), ...(await readStart(this.file(agentId))) }
    if (this.stopped || this.agents.has(agentId)) return
    this.agents.set(agentId, { meta, offset: read.offset, settled: agentSettled(read.summary, meta, Date.now()) })
    this.emit({ kind: 'summary', key: this.key, agentId, meta, summary: read.summary })
  }

  private async refresh(agentId: string, known: KnownAgent): Promise<void> {
    let read
    try {
      read = await this.files.read(this.file(agentId))
    } catch {
      return
    }
    // The CLI rewrites the meta file when the agent finishes; a woken agent's first line never changes.
    const meta: SubagentMeta = { agentId, ...(await readMetaFile(this.dir, agentId)), ...startOf(known.meta) }
    if (this.stopped || this.agents.get(agentId) !== known) return
    // The 60 s check shares the cache and may have read the new bytes first, so what counts is what this watcher sent.
    const grew = read.grew || read.offset !== known.offset
    known.offset = read.offset
    known.settled = agentSettled(read.summary, meta, Date.now())
    if (!grew && sameMeta(meta, known.meta)) return
    known.meta = meta
    this.emit({ kind: 'summary', key: this.key, agentId, meta, summary: read.summary })
  }

  private async readOpen(agentId: string, open: OpenAgent): Promise<void> {
    const file = this.file(agentId)
    const closed = (): boolean => this.stopped || this.opened.get(agentId) !== open
    if (!open.cursor) {
      let tail
      try {
        tail = await readLastItems(file, INITIAL_ITEMS, INITIAL_MAX_BYTES, true)
      } catch {
        return
      }
      if (closed()) return
      open.cursor = new TranscriptCursor(file, tail.offset, true)
      this.emit({ kind: 'items', key: this.key, agentId, items: tail.items, reset: true })
      return
    }
    const cursor = open.cursor
    const restarts = cursor.restarts
    let sent = false
    try {
      await cursor.readNew((items) => {
        const reset = !sent && cursor.restarts !== restarts
        sent = true
        this.emit({ kind: 'items', key: this.key, agentId, items, ...(reset ? { reset: true } : {}) })
      }, closed)
    } catch {
      // Gone, or not there yet; the next poll tries again.
    }
  }
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/

function asSource(v: unknown): SubagentSource | null {
  if (!v || typeof v !== 'object') return null
  const { cwd, sessionId } = v as Record<string, unknown>
  return typeof cwd === 'string' && cwd !== '' && typeof sessionId === 'string' && SESSION_ID.test(sessionId) ? { cwd, sessionId } : null
}

const AGENT_ID = /^[A-Za-z0-9_-]{1,128}$/

function asItemsSource(v: unknown): SubagentItemsSource | null {
  const source = asSource(v)
  const agentId = (v as { agentId?: unknown } | null)?.agentId
  return source && typeof agentId === 'string' && AGENT_ID.test(agentId) ? { ...source, agentId } : null
}

/** One watcher per followed session; the renderer counts its own users, so a second watch means it lost its copy and starts over. */
export class SubagentWatchService {
  private watchers = new Map<string, SubagentWatcher>()
  /** Watches still looking up their folder, by the generation that started them. */
  private pending = new Map<string, number>()
  private generation = 0
  /** Agents whose live view is open, by session; an open can arrive while its session's folder is still looked up. */
  private opened = new Map<string, Set<string>>()

  constructor(
    private readonly transcriptsDirFor: (cwd: string) => Promise<string>,
    private readonly emit: (event: SubagentTailEvent) => void
  ) {}

  async watch(raw: unknown): Promise<void> {
    const source = asSource(raw)
    if (!source) return
    const key = subagentSourceKey(source)
    this.drop(key)
    const generation = ++this.generation
    this.pending.set(key, generation)
    const dir = join(await this.transcriptsDirFor(source.cwd), source.sessionId, 'subagents')
    // An unwatch, or a newer watch, arrived while the folder was looked up.
    if (this.pending.get(key) !== generation) return
    this.pending.delete(key)
    const watcher = new SubagentWatcher(dir, key, this.emit)
    this.watchers.set(key, watcher)
    watcher.start()
    for (const agentId of this.opened.get(key) ?? []) watcher.open(agentId)
  }

  unwatch(raw: unknown): void {
    const source = asSource(raw)
    if (!source) return
    const key = subagentSourceKey(source)
    this.drop(key)
    this.opened.delete(key)
  }

  /** Sends one agent's items, then its new ones, while its live view is open; only for a watched session. */
  open(raw: unknown): void {
    const target = asItemsSource(raw)
    if (!target) return
    const key = subagentSourceKey(target)
    const ids = this.opened.get(key) ?? new Set<string>()
    ids.add(target.agentId)
    this.opened.set(key, ids)
    this.watchers.get(key)?.open(target.agentId)
  }

  close(raw: unknown): void {
    const target = asItemsSource(raw)
    if (!target) return
    const key = subagentSourceKey(target)
    this.opened.get(key)?.delete(target.agentId)
    this.watchers.get(key)?.close(target.agentId)
  }

  private drop(key: string): void {
    this.pending.delete(key)
    this.watchers.get(key)?.stop()
    this.watchers.delete(key)
  }

  stopAll(): void {
    this.pending.clear()
    this.opened.clear()
    for (const w of this.watchers.values()) w.stop()
    this.watchers.clear()
  }
}
