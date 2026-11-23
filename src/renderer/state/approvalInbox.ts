export interface InboxItem {
  requestId: string
  paneId: string
  raisedAt: number
}

export interface InboxRow extends InboxItem {
  /** When the item was answered or cancelled outside the inbox; it lingers briefly with a note, then goes. */
  goneAt?: number
}

export interface InboxState {
  rows: InboxRow[]
  selected: string | null
}

const oldestFirst = (items: readonly InboxItem[]): InboxItem[] => [...items].sort((a, b) => a.raisedAt - b.raisedAt)

export function openInbox(pending: readonly InboxItem[], atPane?: string): InboxState {
  const rows = oldestFirst(pending)
  const at = rows.find((r) => r.paneId === atPane) ?? rows[0]
  return { rows, selected: at?.requestId ?? null }
}

export const GONE_LINGER_MS = 1500

/** The row to select once `rows[index]` has gone: the one that took its place, else the one above, else none. */
function selectionAfterDrop(rows: readonly InboxRow[], index: number): string | null {
  return (rows[index] ?? rows[index - 1])?.requestId ?? null
}

function dropRows(state: InboxState, drop: (row: InboxRow) => boolean): InboxState {
  if (!state.rows.some(drop)) return state
  const at = state.rows.findIndex((r) => r.requestId === state.selected)
  const rows = state.rows.filter((r) => !drop(r))
  const selectedGone = at !== -1 && drop(state.rows[at])
  if (!selectedGone) return { rows, selected: state.selected }
  const keptBefore = state.rows.slice(0, at).filter((r) => !drop(r)).length
  return { rows, selected: selectionAfterDrop(rows, keptBefore) }
}

/**
 * Brings the open inbox up to date with what is pending now. New items go to the end, oldest first among themselves;
 * items no longer pending are marked gone and dropped `GONE_LINGER_MS` later.
 */
export function syncInbox(state: InboxState, pending: readonly InboxItem[], now: number): InboxState {
  const stillPending = new Set(pending.map((p) => p.requestId))
  const known = new Set(state.rows.map((r) => r.requestId))
  const added = oldestFirst(pending.filter((p) => !known.has(p.requestId)))
  let changed = added.length > 0
  const rows = state.rows.map((r) => {
    if (r.goneAt !== undefined || stillPending.has(r.requestId)) return r
    changed = true
    return { ...r, goneAt: now }
  })
  const marked: InboxState = changed
    ? { rows: [...rows, ...added], selected: state.selected ?? added[0]?.requestId ?? null }
    : state
  return dropRows(marked, (r) => r.goneAt !== undefined && now - r.goneAt >= GONE_LINGER_MS)
}

/** The item was answered from the inbox itself: it goes at once and the next one is selected. */
export function answeredHere(state: InboxState, requestId: string): InboxState {
  return dropRows(state, (r) => r.requestId === requestId)
}

/** Nothing left to show, so the inbox closes. */
export function inboxDone(state: InboxState): boolean {
  return state.rows.length === 0
}

export function moveSelection(state: InboxState, step: 1 | -1): InboxState {
  const at = state.rows.findIndex((r) => r.requestId === state.selected)
  const next = state.rows[Math.min(state.rows.length - 1, Math.max(0, at + step))]
  return next ? { ...state, selected: next.requestId } : state
}
