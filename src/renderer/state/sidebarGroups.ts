import { UNGROUPED, type AccountLayout, type ChatSeen, type OwnGroup, type SidebarLayout } from '../../shared/sidebarGroups'

/** A chat as the list places it: `pane:<id>` for a chat in the app, `session:<id>` for one in VS Code. */
export interface PlacedChat {
  id: string
  session?: string
}

export interface SeedRepo {
  id: string
  name: string
  folded: boolean
  chats: readonly PlacedChat[]
}

export const EMPTY_ACCOUNT: AccountLayout = { ungrouped: [], ungroupedFolded: false, ungroupedAt: 0, groups: [], known: {} }

const seenOf = (chat: PlacedChat, today: number): ChatSeen => (chat.session ? { seen: today, session: chat.session } : { seen: today })

/** The first layout: every account's repo groups become its own groups, so nothing moves; Ungrouped goes last. */
export function seedLayout(accounts: readonly { profileId: string; repos: readonly SeedRepo[] }[], today: number): SidebarLayout {
  const out: Record<string, AccountLayout> = {}
  for (const { profileId, repos } of accounts) {
    const known: Record<string, ChatSeen> = {}
    for (const chat of repos.flatMap((r) => r.chats)) known[chat.id] = seenOf(chat, today)
    out[profileId] = {
      ...EMPTY_ACCOUNT,
      groups: repos.map((r) => ({ id: r.id, name: r.name, folded: r.folded, chats: r.chats.map((c) => c.id) })),
      ungroupedAt: repos.length,
      known
    }
  }
  return { accounts: out }
}

/** Days a closed chat keeps its place, so resuming it puts it back where it was. */
export const PRUNE_AFTER_DAYS = 30

export interface AccountChats {
  profileId: string
  /** The account's chats in the list, in the order new ones should be placed. */
  chats: readonly PlacedChat[]
}

const sameAccount = (a: AccountLayout, b: AccountLayout): boolean => JSON.stringify(a) === JSON.stringify(b)

const mapChats = (a: AccountLayout, fn: (chats: string[]) => string[]): AccountLayout => ({
  ...a,
  ungrouped: fn(a.ungrouped),
  groups: a.groups.map((g) => ({ ...g, chats: fn(g.chats) }))
})

function placedIds(a: AccountLayout): Set<string> {
  return new Set([...a.ungrouped, ...a.groups.flatMap((g) => g.chats)])
}

/** The account each chat id is placed under, one per id: an id saved under two keeps its own account's place, else the first. */
export function chatHosts(layouts: ReadonlyMap<string, AccountLayout>, ownerOf: (chat: string) => string | undefined): Map<string, string> {
  const host = new Map<string, string>()
  for (const [profileId, a] of layouts) for (const id of placedIds(a)) if (!host.has(id) || ownerOf(id) === profileId) host.set(id, profileId)
  return host
}

/** The closed chat whose place a chat takes, own account first: the VS Code row it was taken over from, or an earlier pane of the same session. */
function earlierPlace(chat: PlacedChat, accounts: readonly string[], draft: ReadonlyMap<string, AccountLayout>, host: ReadonlyMap<string, string>, open: ReadonlyMap<string, PlacedChat>): string | null {
  if (!chat.session) return null
  const free = (id: string, profileId?: string) => !open.has(id) && host.has(id) && (profileId === undefined || host.get(id) === profileId)
  const direct = `session:${chat.session}`
  if (free(direct)) return direct
  for (const profileId of accounts) {
    const { known } = draft.get(profileId)!
    const found = Object.keys(known).find((id) => known[id].session === chat.session && free(id, profileId))
    if (found) return found
  }
  return null
}

function settleAccount(a: AccountLayout, fresh: readonly string[], open: ReadonlyMap<string, PlacedChat>, today: number): AccountLayout {
  const placed = new Set([...fresh, ...placedIds(a)])
  const known: Record<string, ChatSeen> = { ...a.known }
  for (const id of placed) {
    const chat = open.get(id)
    if (chat) known[id] = seenOf(chat, today)
    else known[id] ??= { seen: today }
  }
  const stale = new Set([...placed].filter((id) => !open.has(id) && known[id].seen < today - PRUNE_AFTER_DAYS))
  for (const id of Object.keys(known)) if (stale.has(id) || !placed.has(id)) delete known[id]
  return mapChats({ ...a, ungrouped: [...fresh, ...a.ungrouped], known }, (list) => list.filter((id) => !stale.has(id)))
}

/**
 * Places every chat in the list, one place per chat across all accounts: a chat placed under any account stays there,
 * new ones go to the top of their own account's Ungrouped, resumed and taken-over ones where they were; prunes long-closed ones.
 * `accounts` are every account there is; places under one not listed are ignored, and dropped there once the chat is placed under a listed one.
 * Same layout back when nothing changed.
 */
export function placeChats(layout: SidebarLayout, accounts: readonly AccountChats[], today: number): SidebarLayout {
  const live = accounts.map((a) => a.profileId)
  const open = new Map<string, PlacedChat>()
  const owner = new Map<string, string>()
  for (const { profileId, chats } of accounts) {
    for (const chat of chats) {
      open.set(chat.id, chat)
      owner.set(chat.id, profileId)
    }
  }
  const draft = new Map(live.map((p) => [p, layout.accounts[p] ?? EMPTY_ACCOUNT]))
  const host = chatHosts(draft, (id) => owner.get(id))
  for (const [p, a] of draft) if ([...placedIds(a)].some((id) => host.get(id) !== p)) draft.set(p, mapChats(a, (list) => list.filter((id) => host.get(id) === p)))
  const fresh = new Map<string, string[]>(live.map((p) => [p, []]))
  for (const [id, chat] of open) {
    if (host.has(id)) continue
    const own = owner.get(id)!
    const earlier = earlierPlace(chat, [own, ...live.filter((p) => p !== own)], draft, host, open)
    const at = earlier ? host.get(earlier)! : own
    if (earlier) {
      draft.set(at, mapChats(draft.get(at)!, (list) => list.map((c) => (c === earlier ? id : c))))
      host.delete(earlier)
    } else fresh.get(own)!.push(id)
    host.set(id, at)
  }
  let next = layout
  const put = (p: string, after: AccountLayout) => {
    const before = layout.accounts[p]
    if (before ? !sameAccount(after, before) : !sameAccount(after, EMPTY_ACCOUNT)) next = { accounts: { ...next.accounts, [p]: after } }
  }
  for (const [p, a] of draft) put(p, settleAccount(a, fresh.get(p)!, open, today))
  for (const [p, a] of Object.entries(layout.accounts)) {
    if (draft.has(p) || ![...placedIds(a)].some((id) => host.has(id))) continue
    put(p, { ...mapChats(a, (list) => list.filter((id) => !host.has(id))), known: Object.fromEntries(Object.entries(a.known).filter(([id]) => !host.has(id))) })
  }
  return next
}

/** Where a dragged chat lands: a group (or `UNGROUPED`), before one of its chats or at its end. */
export interface ChatDrop {
  group: string
  before: string | null
}

type Lists = { id: string; chats: string[] }[]

/** The account's group ids top to bottom, `UNGROUPED` among them. */
export function groupOrder(a: AccountLayout): string[] {
  const ids = a.groups.map((g) => g.id)
  ids.splice(Math.min(a.ungroupedAt, ids.length), 0, UNGROUPED)
  return ids
}

/** Puts the groups in the given order, `UNGROUPED` among them. */
function withOrder(a: AccountLayout, order: readonly string[], groups: readonly OwnGroup[] = a.groups): AccountLayout {
  const byId = new Map(groups.map((g) => [g.id, g]))
  return { ...a, groups: order.flatMap((id) => byId.get(id) ?? []), ungroupedAt: order.indexOf(UNGROUPED) }
}

const listsOf = (a: AccountLayout): Lists =>
  groupOrder(a).map((id) => ({ id, chats: id === UNGROUPED ? a.ungrouped : a.groups.find((g) => g.id === id)!.chats }))

function withLists(a: AccountLayout, lists: Lists): AccountLayout {
  const byId = new Map(lists.map((l) => [l.id, l.chats]))
  return { ...a, ungrouped: byId.get(UNGROUPED) ?? a.ungrouped, groups: a.groups.map((g) => ({ ...g, chats: byId.get(g.id) ?? g.chats })) }
}

function changeAccount(layout: SidebarLayout, profileId: string, fn: (a: AccountLayout) => AccountLayout | null): SidebarLayout {
  const before = layout.accounts[profileId]
  const after = fn(before ?? EMPTY_ACCOUNT)
  if (!after || (before && after === before)) return layout
  return { accounts: { ...layout.accounts, [profileId]: after } }
}

export function groupOf(layout: SidebarLayout, profileId: string, chat: string): string | null {
  const a = layout.accounts[profileId]
  return a ? (listsOf(a).find((l) => l.chats.includes(chat))?.id ?? null) : null
}

/** The account whose lists hold the chat; a chat sits in at most one. */
export function hostOf(layout: SidebarLayout, chat: string): string | null {
  return Object.keys(layout.accounts).find((p) => placedIds(layout.accounts[p]).has(chat)) ?? null
}

/** Moves a chat from wherever it is placed into a group of `profileId`, any account; a drop onto a chat not in the target group changes nothing. */
export function moveChat(layout: SidebarLayout, profileId: string, chat: string, drop: ChatDrop): SidebarLayout {
  const from = hostOf(layout, chat)
  if (!from || drop.before === chat) return layout
  const source = layout.accounts[from]
  const target = listsOf(from === profileId ? source : (layout.accounts[profileId] ?? EMPTY_ACCOUNT)).find((l) => l.id === drop.group)
  if (!target || (drop.before !== null && !target.chats.includes(drop.before))) return layout
  const { [chat]: seen, ...rest } = source.known
  const accounts = { ...layout.accounts, [from]: mapChats({ ...source, known: rest }, (list) => list.filter((c) => c !== chat)) }
  const into = accounts[profileId] ?? EMPTY_ACCOUNT
  const lists = listsOf(into)
  const list = lists.find((l) => l.id === drop.group)!
  const chats = [...list.chats]
  chats.splice(drop.before === null ? chats.length : chats.indexOf(drop.before), 0, chat)
  accounts[profileId] = withLists({ ...into, known: seen ? { ...into.known, [chat]: seen } : into.known }, [{ id: list.id, chats }])
  return { accounts }
}

/** Alt+↑/↓: steps a chat past the next chat of its group that is shown; nothing at either end. */
export function moveChatStep(layout: SidebarLayout, profileId: string, chat: string, shown: ReadonlySet<string>, dir: -1 | 1): SidebarLayout {
  const a = layout.accounts[profileId]
  const list = a && listsOf(a).find((l) => l.chats.includes(chat))
  if (!list) return layout
  const visible = list.chats.filter((c) => shown.has(c) || c === chat)
  const past = visible[visible.indexOf(chat) + dir]
  if (past === undefined) return layout
  const before = dir === -1 ? past : (list.chats[list.chats.indexOf(past) + 1] ?? null)
  return moveChat(layout, profileId, chat, { group: list.id, before })
}

/** Alt+Shift+↓ to the top of the next group, Alt+Shift+↑ to the end of the previous one; Ungrouped counts where it sits. */
export function moveChatToNextGroup(layout: SidebarLayout, profileId: string, chat: string, dir: -1 | 1): SidebarLayout {
  const a = layout.accounts[profileId]
  if (!a) return layout
  const lists = listsOf(a)
  const target = lists[lists.findIndex((l) => l.chats.includes(chat)) + dir]
  if (!target || !lists.some((l) => l.chats.includes(chat))) return layout
  return moveChat(layout, profileId, chat, { group: target.id, before: dir === 1 ? (target.chats[0] ?? null) : null })
}

/** Puts a group, or Ungrouped, before another of its account, or last. */
export function moveGroup(layout: SidebarLayout, profileId: string, group: string, before: string | null): SidebarLayout {
  return changeAccount(layout, profileId, (a) => {
    const order = groupOrder(a)
    if (!order.includes(group) || before === group) return null
    const rest = order.filter((id) => id !== group)
    const at = before === null ? rest.length : rest.indexOf(before)
    if (at < 0) return null
    rest.splice(at, 0, group)
    const next = withOrder(a, rest)
    return sameAccount(next, a) ? a : next
  })
}

/** A group dropped on another's header: right before it, or right after it. */
export function moveGroupBeside(layout: SidebarLayout, profileId: string, group: string, target: string, side: 'before' | 'after'): SidebarLayout {
  if (side === 'before') return moveGroup(layout, profileId, group, target)
  const order = groupOrder(layout.accounts[profileId] ?? EMPTY_ACCOUNT).filter((id) => id !== group)
  const at = order.indexOf(target)
  return at < 0 ? layout : moveGroup(layout, profileId, group, order[at + 1] ?? null)
}

/** A new group goes last; made from a chat, it takes the chat and goes right after the chat's group. Never below an Ungrouped that is last. */
export function createGroup(layout: SidebarLayout, profileId: string, spec: { id: string; name: string; chat?: string }): SidebarLayout {
  const name = spec.name.trim()
  if (!name) return layout
  const { chat } = spec
  return changeAccount(layout, profileId, (a) => {
    const fresh: OwnGroup = { id: spec.id, name, folded: false, chats: [] }
    const from = chat === undefined ? undefined : listsOf(a).find((l) => l.chats.includes(chat))
    if (chat !== undefined && !from) return null
    const order = groupOrder(a)
    const wanted = from ? order.indexOf(from.id) + 1 : order.length
    const belowLastUngrouped = wanted === order.length && order[order.length - 1] === UNGROUPED
    order.splice(belowLastUngrouped ? wanted - 1 : wanted, 0, spec.id)
    const placed = withOrder(a, order, [...a.groups, fresh])
    if (!from || chat === undefined) return placed
    return withLists(placed, [
      { id: from.id, chats: from.chats.filter((c) => c !== chat) },
      { id: spec.id, chats: [chat] }
    ])
  })
}

export function renameGroup(layout: SidebarLayout, profileId: string, group: string, name: string): SidebarLayout {
  const trimmed = name.trim()
  if (!trimmed) return layout
  return changeAccount(layout, profileId, (a) =>
    a.groups.some((g) => g.id === group) ? { ...a, groups: a.groups.map((g) => (g.id === group ? { ...g, name: trimmed } : g)) } : null
  )
}

/** Its chats move to the end of Ungrouped. */
export function deleteGroup(layout: SidebarLayout, profileId: string, group: string): SidebarLayout {
  return changeAccount(layout, profileId, (a) => {
    const gone = a.groups.find((g) => g.id === group)
    if (!gone) return null
    return withOrder({ ...a, ungrouped: [...a.ungrouped, ...gone.chats] }, groupOrder(a).filter((id) => id !== group))
  })
}

export function setFolded(layout: SidebarLayout, profileId: string, group: string, folded: boolean): SidebarLayout {
  return changeAccount(layout, profileId, (a) => {
    if (group === UNGROUPED) return a.ungroupedFolded === folded ? null : { ...a, ungroupedFolded: folded }
    const g = a.groups.find((x) => x.id === group)
    if (!g || g.folded === folded) return null
    return { ...a, groups: a.groups.map((x) => (x.id === group ? { ...x, folded } : x)) }
  })
}
