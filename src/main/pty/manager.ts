import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { locateShell, type ShellKind } from './shell-locator'
import { childEnv } from '../util/childEnv'

export type PtyKind = ShellKind

export interface SpawnResult {
  ok: boolean
  error?: string
}


type DataCallback = (paneId: string, data: string) => void
type ExitCallback = (paneId: string, exitCode: number, signal: number | undefined) => void

class PtyManager {
  private sessions = new Map<string, IPty>()
  private dataListeners: DataCallback[] = []
  private exitListeners: ExitCallback[] = []

  spawn(paneId: string, kind: PtyKind, cwd: string, extraEnv: Record<string, string> = {}): SpawnResult {
    if (this.sessions.has(paneId)) {
      // Already attached — likely a re-mount. Reuse the existing pty so scrollback survives.
      return { ok: true }
    }
    let launch
    try {
      launch = locateShell(kind, cwd)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
    const env = childEnv(process.env, extraEnv)
    console.log('[pty] spawn', {
      paneId,
      kind,
      cwd,
      command: launch.command,
      args: launch.args,
      extraEnv: Object.keys(extraEnv)
    })
    try {
      const session = pty.spawn(launch.command, launch.args, {
        name: 'xterm-256color',
        cwd,
        cols: 100,
        rows: 30,
        env,
        useConpty: true,
        useConptyDll: true
      } as Parameters<typeof pty.spawn>[2])
      this.sessions.set(paneId, session)
      console.log('[pty] spawned pid', session.pid, 'for pane', paneId)
      session.onData((data) => {
        for (const cb of this.dataListeners) cb(paneId, data)
      })
      session.onExit(({ exitCode, signal }) => {
        this.sessions.delete(paneId)
        console.log('[pty] exit', { paneId, exitCode, signal })
        for (const cb of this.exitListeners) cb(paneId, exitCode, signal)
      })
      return { ok: true }
    } catch (err) {
      console.error('[pty] spawn failed', err)
      return { ok: false, error: (err as Error).message }
    }
  }

  has(paneId: string): boolean {
    return this.sessions.has(paneId)
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

  kill(paneId: string): void {
    const s = this.sessions.get(paneId)
    if (!s) return
    try {
      s.kill()
    } catch {
      // already dead
    }
    this.sessions.delete(paneId)
  }

  killAll(): void {
    for (const id of Array.from(this.sessions.keys())) this.kill(id)
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

export const ptyManager = new PtyManager()
