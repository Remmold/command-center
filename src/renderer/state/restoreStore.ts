import type { AppView } from '../../shared/views'
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

export function savedView(): AppView | null {
  return snapshot.view
}

/** Writes the snapshot on unload, dropping chats that are no longer open. */
export function saveOnUnload(current: () => { view: AppView; openPaneIds: readonly string[] }): void {
  window.addEventListener('beforeunload', () => {
    const { view, openPaneIds } = current()
    snapshot = { ...pruneSnapshot(snapshot, openPaneIds), view }
    write()
  })
}
