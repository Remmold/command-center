import { isWaiting, STATUS_LABEL } from '../../shared/needsYou'
import { accountOf, accountRank, type Account } from './accounts'
import { repoDisplayName, type RepoIdentityViews } from '../../shared/repoIdentity'
import { OBSERVED_STATUS_LABEL, type ObservedSession, type ObservedStatus, type SessionStatus, type SessionStatusEntry, type Workspace } from '../../shared/types'

export interface HostedSessionInput {
  paneId: string
  workspaceId: string
  title: string
  lastActivityAt: number
  /** `model · effort`, e.g. "Opus 5.5 · High". */
  modelTag?: string
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
  modelTag?: string
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
      statusSince: entry?.since ?? 0,
      modelTag: h.modelTag
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

export interface AccountSection {
  account: Account
  groups: SessionGroup[]
  /** Waiting sessions in the section, shown on its header even when it is collapsed. */
  needsYou: number
}

/** The status groups split by the account of each row's workspace, accounts in Settings order. */
export function accountSections(groups: readonly SessionGroup[], accounts: readonly Account[]): AccountSection[] {
  const rank = accountRank(accounts)
  const byAccount = new Map<string, SessionGroup[]>()
  for (const group of groups) {
    const split = new Map<string, SessionRow[]>()
    for (const row of group.rows) {
      const id = accountOf(accounts, row.workspace.profileId).profileId
      split.set(id, [...(split.get(id) ?? []), row])
    }
    for (const [id, rows] of split) byAccount.set(id, [...(byAccount.get(id) ?? []), { id: group.id, rows }])
  }
  return [...byAccount]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([id, groups]) => ({
      account: accountOf(accounts, id),
      groups,
      needsYou: groups.find((g) => g.id === 'needs-you')?.rows.length ?? 0
    }))
}

/** A folded section's header pill; an open one already shows the Needs you group. */
export function waitingBadge(section: AccountSection, open: boolean): { text: string; tooltip: string } | null {
  const n = section.needsYou
  if (open || n === 0) return null
  const chats = n === 1 ? 'chat' : 'chats'
  return { text: `${n} waiting`, tooltip: `${n} ${chats} in ${section.account.name} ${n === 1 ? 'is' : 'are'} waiting on you` }
}

export function sessionRowTooltip(row: SessionRow): string {
  const where = [row.repoName, row.workspace.worktreeTag].filter(Boolean).join(' · ')
  if (row.kind === 'observed') return `${row.title} · ${where} · ${OBSERVED_STATUS_LABEL[row.status]} in VS Code (read-only)`
  const model = row.modelTag ? `${row.modelTag} · ` : ''
  return `${row.title} · ${where} · ${model}${STATUS_LABEL[row.status]} · double-click to rename, Ctrl+click to open beside`
}

/** The rows on screen, top to bottom; collapsed sections show none. */
export function shownRows(sections: readonly AccountSection[], collapsed: readonly string[]): SessionRow[] {
  return sections.filter((s) => !collapsed.includes(s.account.profileId)).flatMap((s) => s.groups.flatMap((g) => g.rows))
}

/** Waiting hosted sessions in the order the list shows them, collapsed sections included. */
export function waitingRows(sections: readonly AccountSection[]): HostedRow[] {
  return sections.flatMap((s) =>
    (s.groups.find((g) => g.id === 'needs-you')?.rows ?? []).filter((r): r is HostedRow => r.kind === 'hosted')
  )
}
