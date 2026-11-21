import type { ChatItem } from '../../shared/chatItems'
import type { BoardModel, SessionStatus } from '../../shared/types'
import { nowBuilding, type NowBuilding } from './nowBuilding'
import { sessionList, type HostedRow, type SessionGroupId, type SessionListInput, type SessionRow } from './sessionList'
import { buildUsageStrip, type RateLimitInfo, type UsageBar, type UsageStripInput, type UsageTallies } from './usageModel'

export interface ObservedTail {
  workspaceId: string
  sessionId: string
  items: readonly ChatItem[]
}

export interface DashboardInput extends Omit<SessionListInput, 'search'> {
  board: BoardModel
  profiles: UsageStripInput['profiles']
  tallies: UsageTallies
  rateLimits: Record<string, RateLimitInfo>
  /** Hosted chat items by pane id. */
  chatItems: Readonly<Record<string, readonly ChatItem[]>>
  /** Items of the one observed session being followed, if any. */
  observedTail: ObservedTail | null
  now: number
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
  usage: UsageBar[]
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

export function dashboard(input: DashboardInput): Dashboard {
  const groups = sessionList({ ...input, search: '' })
  const rowsOf = (id: SessionGroupId) => groups.find((g) => g.id === id)?.rows ?? []
  return {
    needsYou: rowsOf('needs-you').filter((r): r is HostedRow => r.kind === 'hosted'),
    live: [
      ...rowsOf('needs-you'),
      ...rowsOf('running'),
      ...rowsOf('in-vscode').filter((r) => r.kind === 'observed' && r.status === 'live')
    ]
      .map((row) => liveCard(row, input))
      .sort((a, b) => b.lastEventAt - a.lastEventAt),
    nowBuilding: nowBuilding({
      model: input.board,
      statuses: statusesByWorkspace(input),
      worktreeTags: Object.fromEntries(input.workspaces.map((w) => [w.id, w.worktreeTag])),
      now: input.now
    }),
    usage: buildUsageStrip({ ...input, activeProfileId: null })
  }
}
