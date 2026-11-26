import type { ShellKind, ShellLaunch } from './shell-locator'
import { childEnv } from '../util/childEnv'

export type PtyKind = ShellKind

export interface SpawnResult {
  ok: boolean
  error?: string
}

/** The part of node-pty's `IPty` the app uses. */
export interface PtyHandle {
  readonly pid: number
  onData(cb: (data: string) => void): unknown
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): unknown
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export type PtySpawn = (
  file: string,
  args: string[],
  options: { cwd: string; cols: number; rows: number; env: Record<string, string> }
) => PtyHandle

export interface PtyDeps {
  spawn: PtySpawn
  locate: (kind: PtyKind, cwd: string, command?: string) => ShellLaunch
  /** Ends the process's children, like the CLI's `taskkill /T /F`; settles once done. */
  killTree: (pid: number) => Promise<void>
}

type DataCallback = (paneId: string, data: string) => void
type ExitCallback = (paneId: string, exitCode: number, signal: number | undefined) => void

export class PtyManager {
  private sessions = new Map<string, PtyHandle>()
  private dataListeners: DataCallback[] = []
  private exitListeners: ExitCallback[] = []

  constructor(private readonly deps: PtyDeps) {}

  spawn(paneId: string, kind: PtyKind, cwd: string, extraEnv: Record<string, string> = {}, command?: string): SpawnResult {
    if (this.sessions.has(paneId)) return { ok: true }
    let launch: ShellLaunch
    try {
      launch = this.deps.locate(kind, cwd, command)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
    const env = childEnv(process.env, extraEnv)
    console.log('[pty] spawn', { paneId, kind, cwd, command: launch.command, args: launch.args, extraEnv: Object.keys(extraEnv) })
    let session: PtyHandle
    try {
      session = this.deps.spawn(launch.command, launch.args, { cwd, cols: 100, rows: 30, env })
    } catch (err) {
      console.error('[pty] spawn failed', err)
      return { ok: false, error: (err as Error).message }
    }
    this.sessions.set(paneId, session)
    // A killed or replaced pty's late events must not reach the one now under its id.
    const current = (): boolean => this.sessions.get(paneId) === session
    session.onData((data) => {
      if (!current()) return
      for (const cb of this.dataListeners) cb(paneId, data)
    })
    session.onExit(({ exitCode, signal }) => {
      if (!current()) return
      this.sessions.delete(paneId)
      console.log('[pty] exit', { paneId, exitCode, signal })
      for (const cb of this.exitListeners) cb(paneId, exitCode, signal)
    })
    return { ok: true }
  }

  write(paneId: string, data: string): void {
    this.sessions.get(paneId)?.write(data)
  }

  resize(paneId: string, cols: number, rows: number): void {
    try {
      this.sessions.get(paneId)?.resize(Math.max(1, cols | 0), Math.max(1, rows | 0))
    } catch {
      // session may have exited mid-resize; nothing useful to do
    }
  }

  /** Kills the pty's process tree; its exit is not reported. */
  kill(paneId: string): Promise<void> {
    const s = this.sessions.get(paneId)
    if (!s) return Promise.resolve()
    this.sessions.delete(paneId)
    // The tree walk starts at the shell, so the shell dies last.
    return this.deps
      .killTree(s.pid)
      .catch(() => undefined)
      .then(() => {
        try {
          s.kill()
        } catch {
          // already dead
        }
      })
  }

  onData(cb: DataCallback): () => void {
    this.dataListeners.push(cb)
    return () => {
      this.dataListeners = this.dataListeners.filter((c) => c !== cb)
    }
  }

  onExit(cb: ExitCallback): () => void {
    this.exitListeners.push(cb)
    return () => {
      this.exitListeners = this.exitListeners.filter((c) => c !== cb)
    }
  }
}
