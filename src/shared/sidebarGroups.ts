/** The Work list's own groups, saved in `sidebar-groups.json`; each account keeps its own. */

/** The group id of an account's Ungrouped chats. */
export const UNGROUPED = 'ungrouped'

export interface OwnGroup {
  id: string
  name: string
  folded: boolean
  /** Chat ids top to bottom; closed chats keep their place until pruned. */
  chats: string[]
}

export interface ChatSeen {
  /** The day (`dayNumber`) the chat was last in the list. */
  seen: number
  /** The Claude session id it ran, so a resumed chat finds its old place. */
  session?: string
}

export interface AccountLayout {
  ungrouped: string[]
  ungroupedFolded: boolean
  /** Ungrouped sits before `groups[ungroupedAt]`; `groups.length` is last. */
  ungroupedAt: number
  groups: OwnGroup[]
  known: Record<string, ChatSeen>
}

export interface SidebarLayout {
  accounts: Record<string, AccountLayout>
}

const DAY_MS = 24 * 60 * 60 * 1000

export function dayNumber(at: number): number {
  return Math.floor(at / DAY_MS)
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])

function parseGroup(x: unknown): OwnGroup | null {
  if (!isRecord(x) || typeof x.id !== 'string' || !x.id || typeof x.name !== 'string') return null
  return { id: x.id, name: x.name, folded: x.folded === true, chats: strings(x.chats) }
}

function parseKnown(x: unknown): Record<string, ChatSeen> {
  if (!isRecord(x)) return {}
  const out: Record<string, ChatSeen> = {}
  for (const [id, v] of Object.entries(x)) {
    if (!isRecord(v) || typeof v.seen !== 'number' || !Number.isFinite(v.seen)) continue
    out[id] = typeof v.session === 'string' ? { seen: v.seen, session: v.session } : { seen: v.seen }
  }
  return out
}

/** Missing or invalid means last; the next save keeps it. */
function ungroupedPlace(x: unknown, groups: number): number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 ? Math.min(x, groups) : groups
}

function parseAccount(x: unknown): AccountLayout | null {
  if (!isRecord(x)) return null
  const groups = (Array.isArray(x.groups) ? x.groups : []).map(parseGroup).filter((g): g is OwnGroup => g !== null)
  const ids = new Set<string>()
  const unique = (list: string[]) => list.filter((id) => !ids.has(id) && ids.add(id))
  const ungrouped = unique(strings(x.ungrouped))
  const groupIds = new Set<string>([UNGROUPED])
  const own = groups.filter((g) => !groupIds.has(g.id) && groupIds.add(g.id)).map((g) => ({ ...g, chats: unique(g.chats) }))
  return {
    ungrouped,
    ungroupedFolded: x.ungroupedFolded === true,
    ungroupedAt: ungroupedPlace(x.ungroupedAt, own.length),
    groups: own,
    known: parseKnown(x.known)
  }
}

/** A saved layout, cleaned of anything malformed; null when there is none to read. */
export function parseSidebarLayout(raw: unknown): SidebarLayout | null {
  if (!isRecord(raw) || !isRecord(raw.accounts)) return null
  const accounts: Record<string, AccountLayout> = {}
  for (const [id, a] of Object.entries(raw.accounts)) {
    const parsed = parseAccount(a)
    if (parsed) accounts[id] = parsed
  }
  return { accounts }
}
