import type { SessionStatusEntry } from '../../shared/types'
import {
  reduceSessionStatus,
  type SessionStatusEvent,
  type SessionStatusState,
  type UntimedSessionStatusEvent
} from './statusReducer'

type ChangeCallback = (entry: SessionStatusEntry) => void

interface Tracked {
  cwd: string
  state: SessionStatusState
}

export class SessionStatusTracker {
  private sessions = new Map<string, Tracked>()
  private listeners: ChangeCallback[] = []

  spawned(paneId: string, cwd: string, at = Date.now()): void {
    const tracked = this.sessions.get(paneId)
    if (tracked) {
      tracked.cwd = cwd
      this.apply(paneId, { kind: 'spawned' }, at)
      return
    }
    const fresh: Tracked = { cwd, state: reduceSessionStatus(null, { kind: 'spawned', at }) }
    this.sessions.set(paneId, fresh)
    this.emit(paneId, fresh)
  }

  apply(paneId: string, event: UntimedSessionStatusEvent, at = Date.now()): void {
    const tracked = this.sessions.get(paneId)
    if (!tracked) return
    const next = reduceSessionStatus(tracked.state, { ...event, at } as SessionStatusEvent)
    const changed = next.status !== tracked.state.status || next.since !== tracked.state.since
    tracked.state = next
    if (changed) this.emit(paneId, tracked)
  }

  private emit(paneId: string, tracked: Tracked): void {
    const entry = toEntry(paneId, tracked)
    for (const cb of this.listeners) cb(entry)
  }

  list(): SessionStatusEntry[] {
    return Array.from(this.sessions, ([paneId, tracked]) => toEntry(paneId, tracked))
  }

  onChange(cb: ChangeCallback): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((c) => c !== cb)
    }
  }
}

function toEntry(paneId: string, { cwd, state }: Tracked): SessionStatusEntry {
  return { paneId, cwd, status: state.status, since: state.since }
}

export const sessionStatusTracker = new SessionStatusTracker()
