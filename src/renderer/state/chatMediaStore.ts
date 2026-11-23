import { create } from 'zustand'
import type { MediaAttachment } from '../components/chat/chatMedia'

/** A hosted session by its pane id, a followed VS Code session by `observed:<session id>`. */
export type ChatMediaKey = string

export type ChatTab = 'chat' | 'media'

export function mediaKeyOf(chat: { kind: 'hosted'; paneId: string } | { kind: 'observed'; sessionId: string }): ChatMediaKey {
  return chat.kind === 'hosted' ? chat.paneId : `observed:${chat.sessionId}`
}

/** The tab a chat shows: Media only while it has media to show. */
export function shownTab(chosen: ChatTab | undefined, mediaCount: number): ChatTab {
  return mediaCount > 0 && chosen === 'media' ? 'media' : 'chat'
}

const OLD_PANEL_KEY = 'command-center.media-panel'

/** A width the Media column saved before it became a tab; nothing reads it now. */
export function dropSavedPanelWidth(storage: Pick<Storage, 'removeItem'> | undefined): void {
  try {
    storage?.removeItem(OLD_PANEL_KEY)
  } catch {
    // Blocked storage keeps the stale key, which nothing reads.
  }
}

interface ChatMediaState {
  /** Each chat's tab while the app runs; each half of a split has its own session, so its own tab. */
  tab: Record<ChatMediaKey, ChatTab>
  /** Chats whose Media tab shows, so the shortcut leaves the others on Chat. */
  hasMedia: Record<ChatMediaKey, boolean>
  /** Images pasted or dropped into prompts, by pane; in memory only. */
  attachments: Record<string, MediaAttachment[]>
  setTab: (key: ChatMediaKey, tab: ChatTab) => void
  toggleTab: (key: ChatMediaKey) => void
  setHasMedia: (key: ChatMediaKey, hasMedia: boolean) => void
  addAttachments: (paneId: string, attachments: readonly MediaAttachment[]) => void
}

export const useChatMediaStore = create<ChatMediaState>()((set) => ({
  tab: {},
  hasMedia: {},
  attachments: {},
  setTab: (key, tab) => set((s) => (s.tab[key] === tab ? s : { tab: { ...s.tab, [key]: tab } })),
  toggleTab: (key) =>
    set((s) => {
      const next = shownTab(s.tab[key], s.hasMedia[key] ? 1 : 0) === 'media' ? 'chat' : 'media'
      return next === 'media' && !s.hasMedia[key] ? s : { tab: { ...s.tab, [key]: next } }
    }),
  setHasMedia: (key, hasMedia) => set((s) => (Boolean(s.hasMedia[key]) === hasMedia ? s : { hasMedia: { ...s.hasMedia, [key]: hasMedia } })),
  addAttachments: (paneId, added) => {
    if (added.length === 0) return
    set((s) => ({ attachments: { ...s.attachments, [paneId]: [...(s.attachments[paneId] ?? []), ...added] } }))
  }
}))

dropSavedPanelWidth(typeof localStorage === 'undefined' ? undefined : localStorage)
