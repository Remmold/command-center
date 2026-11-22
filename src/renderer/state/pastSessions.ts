import type { LocalSessionInfo, ObservedStatus, SessionStatus } from '../../shared/types'

/** As the extension's row age: the largest whole unit, months as 30 days. */
export function sessionAge(modifiedAt: number, now: number): string {
  const minutes = Math.floor(Math.floor((now - modifiedAt) / 1000) / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)
  if (years > 0) return `${years}y`
  if (months > 0) return `${months}mo`
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return 'now'
}

export type PastSessionDotState = 'running' | 'waiting' | 'idle'

export interface PastSessionDot {
  state: PastSessionDotState
  tooltip: string
}

const HERE = 'Open in this window'
const VSCODE = 'Open in another VS Code window'

function withState(where: string, state: PastSessionDotState): PastSessionDot {
  const tooltip = state === 'waiting' ? `${where} — awaiting input` : state === 'running' ? `${where} — running` : where
  return { state, tooltip }
}

/** As the extension: a dot only for a session open somewhere, saying where and what it is doing. */
export function pastSessionDot(open: { hosted?: SessionStatus; observed?: ObservedStatus }): PastSessionDot | null {
  if (open.hosted) {
    const state = open.hosted === 'running' ? 'running' : open.hosted === 'needs-approval' ? 'waiting' : 'idle'
    return withState(HERE, state)
  }
  if (open.observed) return withState(VSCODE, open.observed === 'live' ? 'running' : 'idle')
  return null
}

/** As the extension's session search: the title or the git branch contains the query. */
export function matchesSearch(session: LocalSessionInfo, query: string): boolean {
  const q = query.toLowerCase()
  return session.title.toLowerCase().includes(q) || (session.gitBranch?.toLowerCase().includes(q) ?? false)
}
