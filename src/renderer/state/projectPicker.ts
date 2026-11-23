import type { LocalSessionInfo, Workspace } from '../../shared/types'
import { matchesSearch } from './pastSessions'
import type { TakeOverTarget } from './takeOverStore'

/** Step 1 lists projects; step 2 one project's New chat and recent sessions. */
export type SessionListStep = { kind: 'sessions'; workspaceId: string }
export type PickerStep = { kind: 'projects' } | SessionListStep

export const SESSION_LIMIT = 50
const RECENT_LIMIT = 50

/** Last use per workspace id, in ms. */
export type RecentProjects = Readonly<Record<string, number>>

export function touchRecent(recent: RecentProjects, workspaceId: string, now: number): Record<string, number> {
  const kept = Object.entries({ ...recent, [workspaceId]: now })
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_LIMIT)
  return Object.fromEntries(kept)
}

export function startStep(workspaceId: string | null, workspaces: readonly Workspace[]): PickerStep {
  return workspaceId && workspaces.some((w) => w.id === workspaceId) ? { kind: 'sessions', workspaceId } : { kind: 'projects' }
}

export function stepBack(_step: PickerStep): PickerStep {
  return { kind: 'projects' }
}

export interface SessionRows {
  shown: LocalSessionInfo[]
  /** Matches left out until Show all. */
  hidden: number
}

export function sessionRows({ sessions, query, showAll }: { sessions: readonly LocalSessionInfo[]; query: string; showAll: boolean }): SessionRows {
  const matching = sessions.filter((s) => matchesSearch(s, query)).sort((a, b) => b.modifiedAt - a.modifiedAt)
  const shown = showAll ? matching : matching.slice(0, SESSION_LIMIT)
  return { shown, hidden: matching.length - shown.length }
}

export type PickerRow =
  | { kind: 'project'; workspaceId: string }
  | { kind: 'new-chat' }
  | { kind: 'session'; session: LocalSessionInfo }
  | { kind: 'show-all' }

export type PickAction =
  | { kind: 'open-project'; workspaceId: string }
  | { kind: 'new-chat'; workspaceId: string }
  /** The session's own row, to resume it should its tab be gone. */
  | { kind: 'switch'; paneId: string; workspaceId: string; session: LocalSessionInfo }
  | { kind: 'resume'; workspaceId: string; session: LocalSessionInfo }
  | { kind: 'take-over'; target: TakeOverTarget }
  | { kind: 'show-all' }

/** Where a session is open: a tab here, or a VS Code window of that workspace. */
export type SessionWhereabouts = (sessionId: string) => { paneId?: string; vsCodeWorkspaceId?: string }

export function enterAction(step: PickerStep, row: PickerRow, where: SessionWhereabouts): PickAction {
  if (row.kind === 'project') return { kind: 'open-project', workspaceId: row.workspaceId }
  if (row.kind === 'show-all') return { kind: 'show-all' }
  if (step.kind !== 'sessions') throw new Error(`${row.kind} row outside the sessions step`)
  if (row.kind === 'new-chat') return { kind: 'new-chat', workspaceId: step.workspaceId }
  const { session } = row
  const { paneId, vsCodeWorkspaceId } = where(session.sessionId)
  if (paneId) return { kind: 'switch', paneId, workspaceId: step.workspaceId, session }
  if (vsCodeWorkspaceId) return { kind: 'take-over', target: { workspaceId: vsCodeWorkspaceId, sessionId: session.sessionId, title: session.title } }
  return { kind: 'resume', workspaceId: step.workspaceId, session }
}
