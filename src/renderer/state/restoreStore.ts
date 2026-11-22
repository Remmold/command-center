import type { AppView } from '../../shared/views'
import { useProjectViewsStore } from './projectViewsStore'
import { useViewStore } from './viewStore'
import { EMPTY_SNAPSHOT, parseSnapshot, pruneSnapshot, withDraft, withScroll, type RestoreSnapshot, type SavedScroll } from './restoreSnapshot'

const KEY = 'command-center.restore'

function read(): RestoreSnapshot {
  try {
    return parseSnapshot(localStorage.getItem(KEY))
  } catch {
    return EMPTY_SNAPSHOT
  }
}

/** The snapshot as the last run left it; drafts and scroll places are read from here while chats mount. */
let snapshot = read()

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.error('could not save drafts and scroll places', err)
  }
}

export function savedDraft(paneId: string): string {
  return snapshot.drafts[paneId] ?? ''
}

export function saveDraft(paneId: string, text: string): void {
  if (savedDraft(paneId) === text) return
  snapshot = withDraft(snapshot, paneId, text)
  write()
}

export function savedScroll(paneId: string): SavedScroll | undefined {
  return snapshot.scroll[paneId]
}

/** Kept in memory; written when the window unloads, since scroll events come too often to write each. */
export function noteScroll(paneId: string, scroll: SavedScroll): void {
  snapshot = withScroll(snapshot, paneId, scroll)
}

let started = false

/** Reopens the saved view after a restart to update, and writes the snapshot on unload without sessions that were closed. */
export function startRestore(): void {
  if (started) return
  started = true
  const view: AppView | null = snapshot.view
  void window.api.update.status().then((status) => {
    if (status.afterUpdate && view) useViewStore.getState().setView(view)
  })
  window.addEventListener('beforeunload', () => {
    const openPaneIds = Object.values(useProjectViewsStore.getState().views).flatMap((v) => v.claudeSessions.map((c) => c.id))
    snapshot = { ...pruneSnapshot(snapshot, openPaneIds), view: useViewStore.getState().view }
    write()
  })
}
