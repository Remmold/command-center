import { ClaudeSession } from './session'

type EventCallback = (paneId: string, event: unknown) => void
type ExitCallback = (paneId: string, code: number | null) => void

class ClaudeManager {
  private sessions = new Map<string, ClaudeSession>()
  private eventListeners: EventCallback[] = []
  private exitListeners: ExitCallback[] = []

  start(
    paneId: string,
    cwd: string,
    model?: string,
    resumeSessionId?: string,
    permissionMode?: string
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
          this.sessions.delete(id)
          for (const cb of this.exitListeners) cb(id, code)
        },
        model,
        resumeSessionId,
        permissionMode
      )
      this.sessions.set(paneId, session)
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
    this.sessions.get(paneId)?.send(text, images)
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

  onExit(cb: ExitCallback): () => void {
    this.exitListeners.push(cb)
    return () => {
      this.exitListeners = this.exitListeners.filter((c) => c !== cb)
    }
  }
}

export const claudeManager = new ClaudeManager()
