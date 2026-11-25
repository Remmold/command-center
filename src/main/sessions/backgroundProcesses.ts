import {
  NO_BACKGROUND_PROCESSES,
  backgroundProcessList,
  reduceBackgroundProcesses,
  type BackgroundProcessesState
} from '../../shared/backgroundProcesses'
import type { BackgroundProcessesEntry } from '../../shared/types'

type ChangeCallback = (entry: BackgroundProcessesEntry) => void

/** Each hosted session's background processes, for as long as its CLI process runs. */
export class BackgroundProcessTracker {
  private sessions = new Map<string, BackgroundProcessesState>()
  private listeners: ChangeCallback[] = []

  spawned(paneId: string): void {
    this.drop(paneId)
    this.sessions.set(paneId, NO_BACKGROUND_PROCESSES)
  }

  event(paneId: string, line: unknown, at = Date.now()): void {
    const before = this.sessions.get(paneId)
    if (!before) return
    const after = reduceBackgroundProcesses(before, line, at)
    this.sessions.set(paneId, after)
    if (after.listed !== before.listed || commandArrived(before, after)) this.emit({ paneId, processes: backgroundProcessList(after) })
  }

  exited(paneId: string): void {
    this.drop(paneId)
  }

  list(): BackgroundProcessesEntry[] {
    return Array.from(this.sessions, ([paneId, state]) => ({ paneId, processes: backgroundProcessList(state) })).filter((e) => e.processes.length > 0)
  }

  onChange(cb: ChangeCallback): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((c) => c !== cb)
    }
  }

  private drop(paneId: string): void {
    const state = this.sessions.get(paneId)
    this.sessions.delete(paneId)
    if (state && state.listed.length > 0) this.emit({ paneId, processes: [] })
  }

  private emit(entry: BackgroundProcessesEntry): void {
    for (const cb of this.listeners) cb(entry)
  }
}

/** A Bash call that lands after its task started renames a listed row. */
function commandArrived(before: BackgroundProcessesState, after: BackgroundProcessesState): boolean {
  if (after.commands === before.commands) return false
  return after.listed.some((t) => t.toolUseId !== undefined && after.commands[t.toolUseId] !== before.commands[t.toolUseId])
}

export const backgroundProcessTracker = new BackgroundProcessTracker()
