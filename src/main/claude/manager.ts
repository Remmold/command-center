import { ClaudeSession } from './session'
import { permissionServer } from '../permission/server'

type EventCallback = (paneId: string, event: unknown) => void
type ExitCallback = (paneId: string, code: number | null) => void
type SpawnCallback = (paneId: string, cwd: string) => void
type SendCallback = (paneId: string) => void

class ClaudeManager {
  private sessions = new Map<string, ClaudeSession>()
  private eventListeners: EventCallback[] = []
  private exitListeners: ExitCallback[] = []
  private spawnListeners: SpawnCallback[] = []
  private sendListeners: SendCallback[] = []

  start(
    paneId: string,
    cwd: string,
    model?: string,
    resumeSessionId?: string,
    permissionMode?: string,
    profileEnv: Record<string, string> = {}
  ): { ok: boolean; error?: string } {
    const existing = this.sessions.get(paneId)
    if (existing && existing.isAlive()) return { ok: true }
    try {
      const session = new ClaudeSession(
        paneId,
        cwd,
        (id, event) => {
          for (const cb of this.eventListeners) cb(id, event)
        },
        (id, code) => {
          // A stopped process can exit after a new one took its pane; that exit is stale.
          const current = this.sessions.get(id)
          if (current && current !== session) return
          this.sessions.delete(id)
          for (const cb of this.exitListeners) cb(id, code)
          // After the exit listeners, so the status reducer ignores the resolves this emits.
          permissionServer.clearPane(id)
        },
        model,
        resumeSessionId,
        permissionMode,
        profileEnv
      )
      this.sessions.set(paneId, session)
      for (const cb of this.spawnListeners) cb(paneId, cwd)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  isAlive(paneId: string): boolean {
    return this.sessions.get(paneId)?.isAlive() ?? false
  }

  send(
    paneId: string,
    text: string,
    images?: Array<{ media_type: string; data: string }>
  ): void {
    const session = this.sessions.get(paneId)
    if (!session?.isAlive()) return
    session.send(text, images)
    for (const cb of this.sendListeners) cb(paneId)
  }

  interrupt(paneId: string): void {
    this.sessions.get(paneId)?.interrupt()
  }

  stop(paneId: string): void {
    const s = this.sessions.get(paneId)
    if (!s) return
    s.kill()
    this.sessions.delete(paneId)
  }

  stopAll(): void {
    for (const id of Array.from(this.sessions.keys())) this.stop(id)
  }

  onEvent(cb: EventCallback): () => void {
    this.eventListeners.push(cb)
    return () => {
      this.eventListeners = this.eventListeners.filter((c) => c !== cb)
    }
  }

  onSpawn(cb: SpawnCallback): () => void {
    this.spawnListeners.push(cb)
    return () => {
      this.spawnListeners = this.spawnListeners.filter((c) => c !== cb)
    }
  }

  onSend(cb: SendCallback): () => void {
    this.sendListeners.push(cb)
    return () => {
      this.sendListeners = this.sendListeners.filter((c) => c !== cb)
    }
  }

  onExit(cb: ExitCallback): () => void {
    this.exitListeners.push(cb)
    return () => {
      this.exitListeners = this.exitListeners.filter((c) => c !== cb)
    }
  }
}

export const claudeManager = new ClaudeManager()
