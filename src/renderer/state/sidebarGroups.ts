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

/** The closed chat whose place a chat takes: the VS Code row it was taken over from, or an earlier pane of the same session. */
function earlierPlace(chat: PlacedChat, a: AccountLayout, placed: ReadonlySet<string>, open: ReadonlySet<string>): string | null {
  if (!chat.session) return null
  const free = (id: string) => placed.has(id) && !open.has(id)
  const direct = `session:${chat.session}`
  if (free(direct)) return direct
  return Object.keys(a.known).find((id) => a.known[id].session === chat.session && free(id)) ?? null
}

function placeAccount(before: AccountLayout, chats: readonly PlacedChat[], today: number): AccountLayout {
  const open = new Set(chats.map((c) => c.id))
  let a = before
  const placed = placedIds(a)
  const fresh: string[] = []
  const known: Record<string, ChatSeen> = { ...a.known }
  for (const chat of chats) {
    if (!placed.has(chat.id)) {
      const earlier = earlierPlace(chat, a, placed, open)
      if (earlier) {
        a = mapChats(a, (list) => list.map((id) => (id === earlier ? chat.id : id)))
        placed.delete(earlier)
        delete known[earlier]
      } else fresh.push(chat.id)
      placed.add(chat.id)
    }
    known[chat.id] = seenOf(chat, today)
  }
  for (const id of placed) known[id] ??= { seen: today }
  const stale = new Set([...placed].filter((id) => !open.has(id) && known[id].seen < today - PRUNE_AFTER_DAYS))
  for (const id of Object.keys(known)) if (stale.has(id) || !placed.has(id)) delete known[id]
  a = mapChats({ ...a, ungrouped: [...fresh, ...a.ungrouped], known }, (list) => list.filter((id) => !stale.has(id)))
  return sameAccount(a, before) ? before : a
}

/** Places every chat in the list: new ones at the top of Ungrouped, resumed and taken-over ones where they were; prunes long-closed ones. Same layout back when nothing changed. */
export function placeChats(layout: SidebarLayout, accounts: readonly AccountChats[], today: number): SidebarLayout {
  let next = layout
  for (const { profileId, chats } of accounts) {
    const before = layout.accounts[profileId] ?? EMPTY_ACCOUNT
    const after = placeAccount(before, chats, today)
    if (after !== before || !layout.accounts[profileId]) next = { accounts: { ...next.accounts, [profileId]: after } }
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

/** Moves a chat within its account; a drop into another account, or onto a chat not in the target group, changes nothing. */
export function moveChat(layout: SidebarLayout, profileId: string, chat: string, drop: ChatDrop): SidebarLayout {
  return changeAccount(layout, profileId, (a) => {
    const lists = listsOf(a)
    const target = lists.find((l) => l.id === drop.group)
    if (!target || !lists.some((l) => l.chats.includes(chat)) || drop.before === chat) return null
    if (drop.before !== null && !target.chats.includes(drop.before)) return null
    const removed = lists.map((l) => ({ id: l.id, chats: l.chats.filter((c) => c !== chat) }))
    const into = removed.find((l) => l.id === drop.group)!
    const at = drop.before === null ? into.chats.length : into.chats.indexOf(drop.before)
    into.chats.splice(at, 0, chat)
    return withLists(a, removed)
  })
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
