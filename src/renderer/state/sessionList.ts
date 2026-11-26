import { isWaiting, nextWaiting, STATUS_LABEL } from '../../shared/needsYou'
import { accountOf, accountRank, type Account } from './accounts'
import { repoDisplayName, type RepoIdentityViews } from '../../shared/repoIdentity'
import { UNGROUPED, type SidebarLayout } from '../../shared/sidebarGroups'
import { OBSERVED_STATUS_LABEL, type ObservedSession, type ObservedStatus, type SessionStatus, type SessionStatusEntry, type Workspace } from '../../shared/types'
import { EMPTY_ACCOUNT, groupOrder, type AccountChats, type SeedRepo } from './sidebarGroups'

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
  /** The account's own groups in their order, Ungrouped where it sits when it has chats. */
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

/** The account a row's session runs on: its workspace's. */
export function rowAccount(row: SessionRow, accounts: readonly Account[]): Account {
  return accountOf(accounts, row.workspace.profileId)
}

/** The status groups split by account, the workspace's unless `sectionOf` says otherwise, accounts in Settings order; rows keep the status order. */
export function accountRows(
  groups: readonly SessionGroup[],
  accounts: readonly Account[],
  sectionOf: (row: SessionRow) => string = (row) => rowAccount(row, accounts).profileId
): AccountRows[] {
  const rank = accountRank(accounts)
  const byAccount = new Map<string, SessionRow[]>()
  for (const group of groups) {
    for (const row of group.rows) {
      const id = sectionOf(row)
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

/** Every account's own chats for placing, in the compact order; an account without any gets an empty list, as it may hold guests. */
export function accountChats(groups: readonly SessionGroup[], accounts: readonly Account[]): AccountChats[] {
  const own = new Map(accountRows(groups, accounts).map(({ account, rows }) => [account.profileId, rows.map(placed)]))
  const ids = [...new Set([...accounts.map((a) => a.profileId), ...own.keys()])]
  return ids.map((profileId) => ({ profileId, chats: own.get(profileId) ?? [] }))
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
 * The rows split by account, accounts in Settings order, each in its own groups in their saved order, Ungrouped among
 * them; a row not placed yet shows at the top of Ungrouped. Ungrouped shows only with chats in it; while searching, so does every group.
 */
export function accountSections(groups: readonly SessionGroup[], accounts: readonly Account[], layout: SidebarLayout, searching = false): AccountSection[] {
  const host = new Map<string, string>()
  for (const { profileId } of accounts) {
    const a = layout.accounts[profileId]
    if (a) for (const id of [...a.ungrouped, ...a.groups.flatMap((g) => g.chats)]) if (!host.has(id)) host.set(id, profileId)
  }
  const sectionOf = (row: SessionRow) => host.get(row.placeId) ?? rowAccount(row, accounts).profileId
  return accountRows(groups, accounts, sectionOf).map(({ account, rows }) => {
    const a = layout.accounts[account.profileId] ?? EMPTY_ACCOUNT
    const byId = new Map(rows.map((r) => [r.placeId, r]))
    const unplaced = rows.filter((r) => !host.has(r.placeId)).map((r) => r.placeId)
    const own = new Map(a.groups.map((g) => [g.id, g]))
    const list = groupOrder(a)
      .map((id) => {
        const g = own.get(id)
        return g ? listGroup(g.id, g.name, g.folded, g.chats, byId) : listGroup(UNGROUPED, 'Ungrouped', a.ungroupedFolded, [...unplaced, ...a.ungrouped], byId)
      })
      .filter((g) => g.rows.length > 0 || (g.id !== UNGROUPED && !searching))
    return { account, groups: list, rows: list.flatMap((g) => g.rows), needsYou: list.reduce((n, g) => n + g.needsYou, 0) }
  })
}

/** A guest row's own account, the one it runs on, while it sits under another account's section; null otherwise. */
export function guestAccount(row: SessionRow, section: Pick<AccountSection, 'account'>, accounts: readonly Account[]): Account | null {
  const own = rowAccount(row, accounts)
  return own.profileId === section.account.profileId ? null : own
}

export interface MoveTargets {
  account: Account
  /** Its own groups and Ungrouped, in their order. */
  groups: { id: string; name: string }[]
}

/** Where "Move to group" can send a chat: every account's own groups and Ungrouped, the account it sits under first. */
export function moveTargets(layout: SidebarLayout, accounts: readonly Account[], current: string): MoveTargets[] {
  const ordered = [...accounts.filter((a) => a.profileId === current), ...accounts.filter((a) => a.profileId !== current)]
  return ordered.map((account) => {
    const a = layout.accounts[account.profileId] ?? EMPTY_ACCOUNT
    const names = new Map(a.groups.map((g) => [g.id, g.name]))
    return { account, groups: groupOrder(a).map((id) => ({ id, name: names.get(id) ?? 'Ungrouped' })) }
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

type WaitingRow = Pick<HostedRow, 'paneId' | 'status' | 'statusSince'>

/** The waiting row after the one on screen. */
export function nextWaitingRow<R extends WaitingRow>(rows: readonly R[], onScreen: string | null): R | null {
  const next = nextWaiting(
    rows.map((r) => ({ paneId: r.paneId, cwd: '', status: r.status, since: r.statusSince })),
    onScreen
  )
  return (next && rows.find((r) => r.paneId === next.paneId)) ?? null
}
