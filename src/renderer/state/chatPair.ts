export type ChatRef =
  | { kind: 'hosted'; paneId: string }
  | { kind: 'observed'; workspaceId: string; sessionId: string }

export type HalfIndex = 0 | 1

/** One chat, or two side by side; a half is null while it waits for a session to be picked. */
export interface ChatPair {
  halves: [ChatRef | null] | [ChatRef | null, ChatRef | null]
  focused: HalfIndex
}

export const EMPTY_PAIR: ChatPair = { halves: [null], focused: 0 }

export function sameChat(a: ChatRef | null, b: ChatRef | null): boolean {
  if (!a || !b) return false
  if (a.kind === 'hosted') return b.kind === 'hosted' && a.paneId === b.paneId
  return b.kind === 'observed' && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId
}

export function halfShowing(pair: ChatPair, ref: ChatRef): HalfIndex | null {
  const i = pair.halves.findIndex((h) => sameChat(h, ref))
  return i === -1 ? null : (i as HalfIndex)
}

const other =(i: HalfIndex): HalfIndex => (i === 0 ? 1 : 0)

function placeIn(pair: ChatPair, half: HalfIndex, ref: ChatRef): ChatPair['halves'] {
  const halves = [...pair.halves] as ChatPair['halves']
  halves[half] = ref
  return halves
}

/** `beside` leaves the focused chat where it is and fills, or replaces, the other half. */
export function openChat(pair: ChatPair, ref: ChatRef, { beside = false }: { beside?: boolean } = {}): ChatPair {
  const shown = halfShowing(pair, ref)
  if (shown !== null) return { halves: pair.halves, focused: shown }
  // Only one observed transcript can be followed at a time.
  const following = ref.kind === 'observed' ? pair.halves.findIndex((h) => h?.kind === 'observed') : -1
  if (following !== -1) {
    const half = following as HalfIndex
    return { halves: placeIn(pair, half, ref), focused: beside ? pair.focused : half }
  }
  if (!beside || pair.halves[pair.focused] === null) return { halves: placeIn(pair, pair.focused, ref), focused: pair.focused }
  if (pair.halves.length === 1) return { halves: [pair.halves[0], ref], focused: pair.focused }
  return { halves: placeIn(pair, other(pair.focused), ref), focused: pair.focused }
}

export function splitPair(pair: ChatPair): ChatPair {
  if (pair.halves.length === 2) return pair
  return { halves: [pair.halves[0], null], focused: 1 }
}

export function focusHalf(pair: ChatPair, half: HalfIndex): ChatPair {
  if (half >= pair.halves.length || half === pair.focused) return pair
  return { halves: pair.halves, focused: half }
}

export function closeHalf(pair: ChatPair, half: HalfIndex): ChatPair {
  if (pair.halves.length === 1) return EMPTY_PAIR
  return { halves: [pair.halves[other(half)]], focused: 0 }
}

/** Removes the chats `keep` rejects; a split whose half lost its chat collapses to the other half. */
export function dropChats(pair: ChatPair, keep: (ref: ChatRef) => boolean): ChatPair {
  const gone = pair.halves.findIndex((h) => h !== null && !keep(h))
  if (gone === -1) return pair
  return dropChats(closeHalf(pair, gone as HalfIndex), keep)
}

function isChatRef(v: unknown): v is ChatRef {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  if (r.kind === 'hosted') return typeof r.paneId === 'string'
  return r.kind === 'observed' && typeof r.workspaceId === 'string' && typeof r.sessionId === 'string'
}

/** A pair read back from storage; anything malformed starts empty. */
export function restorePair(saved: unknown): ChatPair {
  if (!saved || typeof saved !== 'object') return EMPTY_PAIR
  const { halves, focused } = saved as { halves?: unknown; focused?: unknown }
  if (!Array.isArray(halves) || halves.length < 1 || halves.length > 2) return EMPTY_PAIR
  if (!halves.every((h) => h === null || isChatRef(h))) return EMPTY_PAIR
  const pair = { halves: halves as ChatPair['halves'], focused: 0 as HalfIndex }
  return focused === 1 ? focusHalf(pair, 1) : pair
}
