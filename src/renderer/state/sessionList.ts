import { isWaiting, STATUS_LABEL } from '../../shared/needsYou'
import { accountOf, accountRank, type Account } from './accounts'
import { repoDisplayName, type RepoIdentityViews } from '../../shared/repoIdentity'
import { UNGROUPED, type SidebarLayout } from '../../shared/sidebarGroups'
import { OBSERVED_STATUS_LABEL, type ObservedSession, type ObservedStatus, type SessionStatus, type SessionStatusEntry, type Workspace } from '../../shared/types'
import type { AccountChats, SeedRepo } from './sidebarGroups'

export interface HostedSessionInput {
  paneId: string
  workspaceId: string
  title: string
  lastActivityAt: number
  /** `model · effort`, e.g. "Opus 5.5 · High". */
  modelTag?: string
  claudeSessionId?: string
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
  /** The chat's id in its account's own groups. */
  placeId: string
  /** The Claude session it runs, once known. */
  session?: string
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
      modelTag: h.modelTag,
      placeId: `pane:${h.paneId}`,
      session: h.claudeSessionId
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
      status: o.status,
      placeId: `session:${o.sessionId}`,
      session: o.sessionId
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
  /** In the compact list order: Needs you, Running, Idle, In VS Code. */
  rows: SessionRow[]
}

/** One of an account's own groups as the list shows it, or its Ungrouped chats. */
export interface ListGroup {
  /** The group's id, or `UNGROUPED`. */
  id: string
  name: string
  folded: boolean
  /** In the group's saved order. */
  rows: SessionRow[]
  needsYou: number
}

export interface AccountSection {
  account: Account
  /** Ungrouped first when it has chats, then the account's own groups in their order. */
  groups: ListGroup[]
  /** Every row of the section, top to bottom with all groups open. */
  rows: SessionRow[]
  /** Waiting sessions in the section, shown on its header when it is folded. */
  needsYou: number
}

interface AccountRows {
  account: Account
  rows: SessionRow[]
}

/** The status groups split by the account of each row's workspace, accounts in Settings order; rows keep the status order. */
export function accountRows(groups: readonly SessionGroup[], accounts: readonly Account[]): AccountRows[] {
  const rank = accountRank(accounts)
  const byAccount = new Map<string, SessionRow[]>()
  for (const group of groups) {
    for (const row of group.rows) {
      const id = accountOf(accounts, row.workspace.profileId).profileId
      byAccount.set(id, [...(byAccount.get(id) ?? []), row])
    }
  }
  return [...byAccount].sort(([a], [b]) => rank(a) - rank(b)).map(([id, rows]) => ({ account: accountOf(accounts, id), rows }))
}

/** An account's rows by repo, in saved workspace order, worktrees of one repo together; what the first layout is seeded from. */
export function repoGroups(rows: readonly SessionRow[], workspaces: readonly Workspace[]): RepoGroup[] {
  const first = new Map<string, number>()
  workspaces.forEach((workspace, at) => {
    if (!first.has(workspace.repoGroupKey)) first.set(workspace.repoGroupKey, at)
  })
  const groups = new Map<string, RepoGroup>()
  for (const row of rows) {
    const key = row.workspace.repoGroupKey
    const group = groups.get(key) ?? { repoGroupKey: key, repoName: row.repoName, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  const at = (key: string) => first.get(key) ?? workspaces.length
  return [...groups.values()].sort((a, b) => at(a.repoGroupKey) - at(b.repoGroupKey))
}

const placed = (row: SessionRow) => (row.session ? { id: row.placeId, session: row.session } : { id: row.placeId })

/** Each account's chats for placing, in the compact order. */
export function accountChats(groups: readonly SessionGroup[], accounts: readonly Account[]): AccountChats[] {
  return accountRows(groups, accounts).map(({ account, rows }) => ({ profileId: account.profileId, chats: rows.map(placed) }))
}

/** How a repo group's fold was remembered before own groups: per account. */
export function repoFoldKey(profileId: string, repoGroupKey: string): string {
  return `${profileId}/${repoGroupKey}`
}

/** What the first layout is seeded from: each account's repo groups as the list showed them, folds included. */
export function seedSource(
  groups: readonly SessionGroup[],
  accounts: readonly Account[],
  workspaces: readonly Workspace[],
  foldedRepos: readonly string[]
): { profileId: string; repos: SeedRepo[] }[] {
  return accountRows(groups, accounts).map(({ account, rows }) => ({
    profileId: account.profileId,
    repos: repoGroups(rows, workspaces).map((g) => ({
      id: `repo:${g.repoGroupKey}`,
      name: g.repoName,
      folded: foldedRepos.includes(repoFoldKey(account.profileId, g.repoGroupKey)),
      chats: g.rows.map(placed)
    }))
  }))
}

function listGroup(id: string, name: string, folded: boolean, ids: readonly string[], byId: ReadonlyMap<string, SessionRow>): ListGroup {
  const rows = ids.flatMap((i) => byId.get(i) ?? [])
  return { id, name, folded, rows, needsYou: rows.filter(isNeedsYouRow).length }
}

/**
 * The rows split by account, accounts in Settings order, each in its own groups in their saved order; a row not
 * placed yet shows at the top of Ungrouped. Ungrouped shows only with chats in it; while searching, so does every group.
 */
export function accountSections(groups: readonly SessionGroup[], accounts: readonly Account[], layout: SidebarLayout, searching = false): AccountSection[] {
  return accountRows(groups, accounts).map(({ account, rows }) => {
    const a = layout.accounts[account.profileId]
    const byId = new Map(rows.map((r) => [r.placeId, r]))
    const ungrouped = a?.ungrouped ?? []
    const placedIds = new Set([...ungrouped, ...(a?.groups.flatMap((g) => g.chats) ?? [])])
    const unplaced = rows.filter((r) => !placedIds.has(r.placeId)).map((r) => r.placeId)
    const list = [
      listGroup(UNGROUPED, 'Ungrouped', a?.ungroupedFolded ?? false, [...unplaced, ...ungrouped], byId),
      ...(a?.groups ?? []).map((g) => listGroup(g.id, g.name, g.folded, g.chats, byId))
    ].filter((g) => g.rows.length > 0 || (g.id !== UNGROUPED && !searching))
    return { account, groups: list, rows: list.flatMap((g) => g.rows), needsYou: list.reduce((n, g) => n + g.needsYou, 0) }
  })
}

export function isNeedsYouRow(row: SessionRow): row is HostedRow {
  return row.kind === 'hosted' && hostedGroup(row.status) === 'needs-you'
}

/** A folded header's pill, account or group; an open one shows its waiting rows. */
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

/** What is folded shut: account profile ids; a group's own fold is its `folded`. */
export interface ListFold {
  accounts: readonly string[]
  /** A search opens every group. */
  searching: boolean
}

/** The folds in effect: a search opens every group, and a list without account headers folds no account. */
export function listFold(foldedAccounts: readonly string[], view: { search: string; headed: boolean }): ListFold {
  return { accounts: view.headed ? foldedAccounts : [], searching: view.search.trim() !== '' }
}

export function groupOpen(group: ListGroup, fold: ListFold): boolean {
  return fold.searching || !group.folded
}

/** The rows on screen, top to bottom; folded accounts and groups show none. */
export function shownRows(sections: readonly AccountSection[], fold: ListFold): SessionRow[] {
  return sections
    .filter((s) => !fold.accounts.includes(s.account.profileId))
    .flatMap((s) => s.groups.filter((g) => groupOpen(g, fold)).flatMap((g) => g.rows))
}

/** Waiting hosted sessions in the order the list shows them, folded sections and groups included. */
export function waitingRows(sections: readonly AccountSection[]): HostedRow[] {
  return sections.flatMap((s) => s.rows.filter(isNeedsYouRow))
}
