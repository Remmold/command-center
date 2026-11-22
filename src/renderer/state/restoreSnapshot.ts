import { APP_VIEWS, type AppView } from '../../shared/views'

export interface SavedScroll {
  top: number
  /** The chat was following new output, so it reopens at the bottom. */
  following: boolean
}

/** What a restart would otherwise lose: unsent drafts, each chat's scroll place and the open view. */
export interface RestoreSnapshot {
  drafts: Readonly<Record<string, string>>
  scroll: Readonly<Record<string, SavedScroll>>
  view: AppView | null
}

export const EMPTY_SNAPSHOT: RestoreSnapshot = { drafts: {}, scroll: {}, view: null }

export function withDraft(snap: RestoreSnapshot, paneId: string, text: string): RestoreSnapshot {
  const { [paneId]: _old, ...rest } = snap.drafts
  return { ...snap, drafts: text ? { ...rest, [paneId]: text } : rest }
}

export function withScroll(snap: RestoreSnapshot, paneId: string, scroll: SavedScroll): RestoreSnapshot {
  return { ...snap, scroll: { ...snap.scroll, [paneId]: scroll } }
}

export function pruneSnapshot(snap: RestoreSnapshot, openPaneIds: readonly string[]): RestoreSnapshot {
  const open = new Set(openPaneIds)
  const keep = <T>(r: Readonly<Record<string, T>>): Record<string, T> => Object.fromEntries(Object.entries(r).filter(([id]) => open.has(id)))
  return { ...snap, drafts: keep(snap.drafts), scroll: keep(snap.scroll) }
}

export function restoredScrollTop(saved: SavedScroll | undefined, box: { scrollHeight: number; clientHeight: number }): number {
  if (!saved || saved.following) return box.scrollHeight
  return Math.max(0, Math.min(saved.top, box.scrollHeight - box.clientHeight))
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseSnapshot(raw: string | null): RestoreSnapshot {
  let data: unknown
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    return EMPTY_SNAPSHOT
  }
  if (!isRecord(data)) return EMPTY_SNAPSHOT
  const drafts = isRecord(data.drafts) ? Object.fromEntries(Object.entries(data.drafts).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')) : {}
  const scroll = isRecord(data.scroll)
    ? Object.fromEntries(
        Object.entries(data.scroll).flatMap(([id, s]) =>
          isRecord(s) && typeof s.top === 'number' && typeof s.following === 'boolean' ? [[id, { top: s.top, following: s.following }] as const] : []
        )
      )
    : {}
  const view = APP_VIEWS.find((v) => v === data.view) ?? null
  return { drafts, scroll, view }
}
