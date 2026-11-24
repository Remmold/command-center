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

export interface RepoGroup {
  repoGroupKey: string
  repoName: string
  /** The first of the group's workspaces in saved order, for its icon. */
  workspace: Workspace
  /** In the compact list order: Needs you, Running, Idle, In VS Code. */
  rows: SessionRow[]
  needsYou: number
}

export interface AccountSection {
  account: Account
  /** The section's repo groups in Settings → Workspaces order. */
  repos: RepoGroup[]
  /** Every row of the section, top to bottom with all groups open. */
  rows: SessionRow[]
  /** Waiting sessions in the section, shown on its header when it is folded. */
  needsYou: number
}

function repoGroups(rows: readonly SessionRow[], workspaces: readonly Workspace[]): RepoGroup[] {
  const first = new Map<string, { at: number; workspace: Workspace }>()
  workspaces.forEach((workspace, at) => {
    if (!first.has(workspace.repoGroupKey)) first.set(workspace.repoGroupKey, { at, workspace })
  })
  const groups = new Map<string, RepoGroup>()
  for (const row of rows) {
    const key = row.workspace.repoGroupKey
    const group = groups.get(key) ?? { repoGroupKey: key, repoName: row.repoName, workspace: row.workspace, rows: [], needsYou: 0 }
    group.rows.push(row)
    if (isNeedsYouRow(row)) group.needsYou++
    groups.set(key, group)
  }
  const at = (key: string) => first.get(key)?.at ?? workspaces.length
  return [...groups.values()]
    .sort((a, b) => at(a.repoGroupKey) - at(b.repoGroupKey))
    .map((g) => ({ ...g, workspace: first.get(g.repoGroupKey)?.workspace ?? g.workspace }))
}

/** The status groups split by the account of each row's workspace, accounts in Settings order, then by repo in saved workspace order; rows keep the status order. */
export function accountSections(groups: readonly SessionGroup[], accounts: readonly Account[], workspaces: readonly Workspace[]): AccountSection[] {
  const rank = accountRank(accounts)
  const byAccount = new Map<string, SessionRow[]>()
  for (const group of groups) {
    for (const row of group.rows) {
      const id = accountOf(accounts, row.workspace.profileId).profileId
      byAccount.set(id, [...(byAccount.get(id) ?? []), row])
    }
  }
  return [...byAccount]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([id, rows]) => {
      const repos = repoGroups(rows, workspaces)
      return {
        account: accountOf(accounts, id),
        repos,
        rows: repos.flatMap((g) => g.rows),
        needsYou: repos.reduce((n, g) => n + g.needsYou, 0)
      }
    })
}

export function isNeedsYouRow(row: SessionRow): row is HostedRow {
  return row.kind === 'hosted' && hostedGroup(row.status) === 'needs-you'
}

/** A folded header's pill, account or repo group; an open one shows its waiting rows. */
export function waitingBadge(n: number, name: string, open: boolean): { text: string; tooltip: string } | null {
  if (open || n === 0) return null
  const chats = n === 1 ? 'chat' : 'chats'
  return { text: `${n} waiting`, tooltip: `${n} ${chats} in ${name} ${n === 1 ? 'is' : 'are'} waiting on you` }
}

export function sessionRowTooltip(row: SessionRow): string {
  const where = [row.repoName, row.workspace.worktreeTag].filter(Boolean).join(' · ')
  if (row.kind === 'observed') return `${row.title} · ${where} · ${OBSERVED_STATUS_LABEL[row.status]} in VS Code (read-only)`
  const model = row.modelTag ? `${row.modelTag} · ` : ''
  return `${row.title} · ${where} · ${model}${STATUS_LABEL[row.status]} · double-click to rename, Ctrl+click to open beside`
}

/** What is folded shut: account profile ids, and repo groups by `repoFoldKey`. */
export interface ListFold {
  accounts: readonly string[]
  repos: readonly string[]
}

/** A repo group's fold is remembered per account. */
export function repoFoldKey(profileId: string, repoGroupKey: string): string {
  return `${profileId}/${repoGroupKey}`
}

/** The folds in effect: a search opens every repo group, and a list without account headers folds no account. */
export function listFold(saved: ListFold, view: { search: string; headed: boolean }): ListFold {
  return { accounts: view.headed ? saved.accounts : [], repos: view.search.trim() ? [] : saved.repos }
}

/** The rows on screen, top to bottom; folded accounts and repo groups show none. */
export function shownRows(sections: readonly AccountSection[], fold: ListFold): SessionRow[] {
  return sections
    .filter((s) => !fold.accounts.includes(s.account.profileId))
    .flatMap((s) => s.repos.filter((g) => !fold.repos.includes(repoFoldKey(s.account.profileId, g.repoGroupKey))).flatMap((g) => g.rows))
}

/** Waiting hosted sessions in the order the list shows them, folded sections and groups included. */
export function waitingRows(sections: readonly AccountSection[]): HostedRow[] {
  return sections.flatMap((s) => s.rows.filter(isNeedsYouRow))
}
