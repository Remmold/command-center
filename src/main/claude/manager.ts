import {
  DEFAULT_PROFILE_ID,
  type ClaudeStartOptions,
  type ControlResult,
  type SessionInit
} from '../../shared/types'
import { ClaudeSession } from './session'
import type { ControlPayload, IncomingHandler } from './controlChannel'

type EventCallback = (paneId: string, event: unknown) => void
type ExitCallback = (paneId: string, code: number | null) => void
type SpawnCallback = (paneId: string, cwd: string) => void
type SendCallback = (paneId: string) => void
type InitCallback = (paneId: string, init: SessionInit) => void

export interface StartOptions extends ClaudeStartOptions {
  profileEnv?: Record<string, string>
  profileId?: string
}

/** Builds the handler for requests the CLI sends on a pane, e.g. `can_use_tool`. */
export type IncomingHandlerFactory = (paneId: string) => IncomingHandler

class ClaudeManager {
  private sessions = new Map<string, ClaudeSession>()
  private profileIds = new Map<string, string>()
  private eventListeners: EventCallback[] = []
  private exitListeners: ExitCallback[] = []
  private spawnListeners: SpawnCallback[] = []
  private sendListeners: SendCallback[] = []
  private initListeners: InitCallback[] = []
  private incomingFactory: IncomingHandlerFactory | null = null

  start(options: StartOptions): { ok: boolean; error?: string } {
    const { paneId, cwd, profileId = DEFAULT_PROFILE_ID } = options
    const existing = this.sessions.get(paneId)
    if (existing && existing.isAlive()) return { ok: true }
    try {
      const session: ClaudeSession = new ClaudeSession({
        paneId,
        cwd,
        model: options.model,
        resumeSessionId: options.resumeSessionId,
        permissionMode: options.permissionMode,
        profileEnv: options.profileEnv,
        onEvent: (id, event) => {
          for (const cb of this.eventListeners) cb(id, event)
        },
        onInit: (id, init) => {
          if (this.sessions.get(id) !== session) return
          for (const cb of this.initListeners) cb(id, init)
        },
        onExit: (id, code) => {
          // A stopped process can exit after a new one took its pane; that exit is stale.
          const current = this.sessions.get(id)
          if (current && current !== session) return
          this.sessions.delete(id)
          for (const cb of this.exitListeners) cb(id, code)
        }
      })
      if (this.incomingFactory) session.setIncomingHandler(this.incomingFactory(paneId))
      this.sessions.set(paneId, session)
      this.profileIds.set(paneId, profileId)
      for (const cb of this.spawnListeners) cb(paneId, cwd)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  /** The account profile the pane's latest process was started on. */
  profileOf(paneId: string): string {
    return this.profileIds.get(paneId) ?? DEFAULT_PROFILE_ID
  }

  isAlive(paneId: string): boolean {
    return this.sessions.get(paneId)?.isAlive() ?? false
  }

  /** The pane's `initialize` data, or null before the handshake replied. */
  initOf(paneId: string): SessionInit | null {
    return this.sessions.get(paneId)?.initInfo() ?? null
  }

  async control(paneId: string, subtype: string, fields: ControlPayload = {}): Promise<ControlResult> {
    const session = this.sessions.get(paneId)
    if (!session?.isAlive()) return { ok: false, error: 'claude process is not running' }
    try {
      return { ok: true, response: await session.request(subtype, fields) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  /** Applies to sessions started from now on. */
  setIncomingHandlerFactory(factory: IncomingHandlerFactory | null): void {
    this.incomingFactory = factory
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

  onInit(cb: InitCallback): () => void {
    this.initListeners.push(cb)
    return () => {
      this.initListeners = this.initListeners.filter((c) => c !== cb)
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
