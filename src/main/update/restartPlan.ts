export const AUTO_RESTART_IDLE_MS = 5 * 60_000

export interface RestartState {
  /** The version waiting to be installed. */
  downloaded: string | null
  downloadedAt: number | null
  /** When the last busy moment ended; null while something is busy. */
  idleSince: number | null
}

export type RestartEvent =
  | { kind: 'downloaded'; version: string; at: number }
  | { kind: 'busy'; busy: boolean; at: number }

export type ClickDecision = { kind: 'none' } | { kind: 'restart' } | { kind: 'confirm'; busy: string[] }

export const INITIAL_RESTART: RestartState = { downloaded: null, downloadedAt: null, idleSince: 0 }

export function reduceRestart(state: RestartState, event: RestartEvent): RestartState {
  if (event.kind === 'downloaded') return { ...state, downloaded: event.version, downloadedAt: state.downloadedAt ?? event.at }
  if (event.busy) return { ...state, idleSince: null }
  return state.idleSince === null ? { ...state, idleSince: event.at } : state
}

/** When the app restarts by itself: the update has waited, and nothing was busy, for `idleMs`. */
export function autoRestartAt(state: RestartState, idleMs: number): number | null {
  if (state.downloaded === null || state.downloadedAt === null || state.idleSince === null) return null
  return Math.max(state.idleSince, state.downloadedAt) + idleMs
}

export function clickRestart(state: RestartState, busy: readonly string[]): ClickDecision {
  if (state.downloaded === null) return { kind: 'none' }
  return busy.length === 0 ? { kind: 'restart' } : { kind: 'confirm', busy: [...busy] }
}
