import type { ChatItem } from '../../shared/chatItems'
import { DEFAULT_PROFILE_ID, type BoardModel, type SessionStatus } from '../../shared/types'
import { nowBuilding, type NowBuilding } from './nowBuilding'
import { sessionList, type HostedRow, type SessionGroupId, type SessionListInput, type SessionRow } from './sessionList'
import type { ProfileUsage } from '../../shared/types'
import { usageEntries, type UsageEntriesInput, type UsageEntry } from './usageModel'
import { accountOf, accountRank, repoAccounts, type Account } from './accounts'

export interface ObservedTail {
  workspaceId: string
  sessionId: string
  items: readonly ChatItem[]
}

export interface DashboardInput extends Omit<SessionListInput, 'search'> {
  board: BoardModel
  profiles: UsageEntriesInput['profiles']
  usage: Readonly<Record<string, ProfileUsage>>
  /** Hosted chat items by pane id. */
  chatItems: Readonly<Record<string, readonly ChatItem[]>>
  /** Items of the one observed session being followed, if any. */
  observedTail: ObservedTail | null
  now: number
  /** Settings order; rows are grouped by these. */
  accounts?: readonly Account[]
}

export interface LiveCard {
  row: SessionRow
  /** Epoch ms of the session's last status change or transcript write. */
  lastEventAt: number
  /** The last assistant text as one plain-text line; null when there is none to show. */
  snippet: string | null
}

export interface Dashboard {
  needsYou: HostedRow[]
  nowBuilding: NowBuilding
  live: LiveCard[]
  usage: UsageEntry[]
  /** Account label by row key (session rows and Now building rows); empty with a single account. */
  accountTags: Readonly<Record<string, string>>
}

const SNIPPET_MAX = 300

export function plainText(markdown: string): string {
  return markdown
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>+)\s*/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

function lastAssistantText(items: readonly ChatItem[] = []): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant') continue
    const text = plainText(
      item.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
    )
    if (text) return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text
  }
  return null
}

function itemsOf(row: SessionRow, input: DashboardInput): readonly ChatItem[] | undefined {
  if (row.kind === 'hosted') return input.chatItems[row.paneId]
  const tail = input.observedTail
  return tail?.workspaceId === row.workspace.id && tail.sessionId === row.sessionId ? tail.items : undefined
}

function liveCard(row: SessionRow, input: DashboardInput): LiveCard {
  return {
    row,
    lastEventAt: row.kind === 'hosted' ? row.statusSince : row.lastActivityAt,
    snippet: lastAssistantText(itemsOf(row, input))
  }
}

function statusesByWorkspace(input: DashboardInput): Record<string, SessionStatus[]> {
  const byPane = new Map(input.statuses.map((e) => [e.paneId, e.status]))
  const out: Record<string, SessionStatus[]> = {}
  for (const h of input.hosted) (out[h.workspaceId] ??= []).push(byPane.get(h.paneId) ?? 'idle')
  return out
}

/** Stable, so each account keeps the order its rows already had. */
function byAccount<T>(items: readonly T[], profileOf: (item: T) => string, rank: (profileId: string) => number): T[] {
  return items
    .map((item, i) => ({ item, i, r: rank(profileOf(item)) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item)
}

function accountTagsOf(rows: readonly SessionRow[], building: NowBuilding, accounts: readonly Account[], byRepo: Record<string, Account>): Record<string, string> {
  if (accounts.length < 2) return {}
  const tags: Record<string, string> = {}
  for (const row of rows) tags[row.key] = accountOf(accounts, row.workspace.profileId).label
  for (const row of [...building.rows, ...building.hidden]) tags[row.key] = (byRepo[row.repoGroupKey] ?? accounts[0]).label
  return tags
}

export function dashboard(input: DashboardInput): Dashboard {
  const accounts = input.accounts ?? []
  const rank = accountRank(accounts)
  const byRepo = repoAccounts(input.workspaces, accounts)
  const repoProfile = (key: string) => (byRepo[key] ?? accounts[0])?.profileId ?? DEFAULT_PROFILE_ID
  const rowProfile = (row: SessionRow) => row.workspace.profileId
  const groups = sessionList({ ...input, search: '' })
  const rowsOf = (id: SessionGroupId) => groups.find((g) => g.id === id)?.rows ?? []
  const needsYou = byAccount(
    rowsOf('needs-you').filter((r): r is HostedRow => r.kind === 'hosted'),
    rowProfile,
    rank
  )
  const live = byAccount(
    [
      ...rowsOf('needs-you'),
      ...rowsOf('running'),
      ...rowsOf('in-vscode').filter((r) => r.kind === 'observed' && r.status === 'live')
    ]
      .map((row) => liveCard(row, input))
      .sort((a, b) => b.lastEventAt - a.lastEventAt),
    (c) => rowProfile(c.row),
    rank
  )
  const building = nowBuilding({
    model: input.board,
    statuses: statusesByWorkspace(input),
    worktreeTags: Object.fromEntries(input.workspaces.map((w) => [w.id, w.worktreeTag])),
    now: input.now
  })
  const nowBuildingByAccount: NowBuilding = {
    ...building,
    rows: byAccount(building.rows, (r) => repoProfile(r.repoGroupKey), rank),
    hidden: byAccount(building.hidden, (r) => repoProfile(r.repoGroupKey), rank)
  }
  return {
    needsYou,
    live,
    nowBuilding: nowBuildingByAccount,
    usage: usageEntries({ profiles: input.profiles, usage: input.usage, activeProfileId: null, now: input.now }),
    accountTags: accountTagsOf([...needsYou, ...live.map((c) => c.row)], nowBuildingByAccount, accounts, byRepo)
  }
}
