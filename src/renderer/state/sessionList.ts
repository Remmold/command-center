import { isWaiting } from '../../shared/needsYou'
import { repoDisplayName, type RepoIdentityViews } from '../../shared/repoIdentity'
import type { ObservedSession, ObservedStatus, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'

export interface HostedSessionInput {
  paneId: string
  workspaceId: string
  title: string
  lastActivityAt: number
}

export interface SessionListInput {
  hosted: readonly HostedSessionInput[]
  statuses: readonly SessionStatusEntry[]
  observed: readonly ObservedSession[]
  workspaces: readonly Workspace[]
  identities: RepoIdentityViews
  search: string
}

interface RowBase {
  key: string
  workspace: Workspace
  /** The repo group's display name. */
  repoName: string
  title: string
  lastActivityAt: number
}

export interface HostedRow extends RowBase {
  kind: 'hosted'
  paneId: string
  status: SessionStatus
  /** When the current status began; 0 before the session has reported one. */
  statusSince: number
}

export interface ObservedRow extends RowBase {
  kind: 'observed'
  sessionId: string
  status: ObservedStatus
}

export type SessionRow = HostedRow | ObservedRow

export type SessionGroupId = 'needs-you' | 'running' | 'idle' | 'in-vscode'

export interface SessionGroup {
  id: SessionGroupId
  rows: SessionRow[]
}

function hostedGroup(status: SessionStatus): SessionGroupId {
  if (isWaiting({ status })) return 'needs-you'
  return status === 'running' ? 'running' : 'idle'
}

const GROUP_ORDER: SessionGroupId[] = ['needs-you', 'running', 'idle', 'in-vscode']

const byRecentActivity = (a: SessionRow, b: SessionRow): number => b.lastActivityAt - a.lastActivityAt

const byLongestWait = (a: SessionRow, b: SessionRow): number =>
  (a.kind === 'hosted' ? a.statusSince : 0) - (b.kind === 'hosted' ? b.statusSince : 0)

function searchWords(search: string): string[] {
  return search.toLowerCase().split(/\s+/).filter(Boolean)
}

function matches(row: SessionRow, words: readonly string[]): boolean {
  const haystack = [row.title, row.repoName, row.workspace.worktreeTag].join('\n').toLowerCase()
  return words.every((w) => haystack.includes(w))
}

export function sessionList(input: SessionListInput): SessionGroup[] {
  const words = searchWords(input.search)
  const repoName = (w: Workspace) => repoDisplayName(w.repoName, input.identities[w.repoGroupKey])
  const workspaces = new Map(input.workspaces.map((w) => [w.id, w]))
  const statuses = new Map(input.statuses.map((e) => [e.paneId, e]))
  const groups = new Map<SessionGroupId, SessionRow[]>(GROUP_ORDER.map((id) => [id, []]))

  for (const h of input.hosted) {
    const workspace = workspaces.get(h.workspaceId)
    if (!workspace) continue
    const entry = statuses.get(h.paneId)
    const status = entry?.status ?? 'idle'
    groups.get(hostedGroup(status))!.push({
      kind: 'hosted',
      key: `hosted:${h.paneId}`,
      paneId: h.paneId,
      workspace,
      repoName: repoName(workspace),
      title: h.title,
      lastActivityAt: h.lastActivityAt,
      status,
      statusSince: entry?.since ?? 0
    })
  }
  for (const o of input.observed) {
    const workspace = workspaces.get(o.workspaceId)
    if (!workspace) continue
    groups.get('in-vscode')!.push({
      kind: 'observed',
      key: `observed:${o.workspaceId}:${o.sessionId}`,
      sessionId: o.sessionId,
      workspace,
      repoName: repoName(workspace),
      title: o.title,
      lastActivityAt: o.modifiedAt,
      status: o.status
    })
  }

  return GROUP_ORDER.map((id) => ({
    id,
    rows: groups
      .get(id)!
      .filter((row) => matches(row, words))
      .sort(id === 'needs-you' ? byLongestWait : byRecentActivity)
  })).filter((g) => g.rows.length > 0)
}
