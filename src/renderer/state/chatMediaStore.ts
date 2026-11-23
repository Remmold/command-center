import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { MediaAttachment } from '../components/chat/chatMedia'

export const MEDIA_PANEL_MIN_WIDTH = 180
export const MEDIA_PANEL_MAX_WIDTH = 720
const DEFAULT_WIDTH = 280

/** A hosted chat by its pane id, a followed VS Code session by `observed:<session id>`. */
export type ChatMediaKey = string

export function observedMediaKey(sessionId: string): ChatMediaKey {
  return `observed:${sessionId}`
}

interface ChatMediaState {
  /** Which chats show their Media panel; each half of a split has its own chat, so its own panel. */
  open: Record<ChatMediaKey, boolean>
  width: number
  /** Images pasted or dropped into prompts, by pane; in memory only. */
  attachments: Record<string, MediaAttachment[]>
  toggle: (key: ChatMediaKey) => void
  setWidth: (width: number) => void
  addAttachments: (paneId: string, attachments: readonly MediaAttachment[]) => void
}

const clampWidth = (width: number): number => Math.round(Math.min(MEDIA_PANEL_MAX_WIDTH, Math.max(MEDIA_PANEL_MIN_WIDTH, width)))

export const useChatMediaStore = create<ChatMediaState>()(
  persist(
    (set) => ({
      open: {},
      width: DEFAULT_WIDTH,
      attachments: {},
      toggle: (key) => set((s) => ({ open: { ...s.open, [key]: !s.open[key] } })),
      setWidth: (width) => set({ width: clampWidth(width) }),
      addAttachments: (paneId, added) => {
        if (added.length === 0) return
        set((s) => ({ attachments: { ...s.attachments, [paneId]: [...(s.attachments[paneId] ?? []), ...added] } }))
      }
    }),
    {
      name: 'command-center.media-panel',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ width: s.width })
    }
  )
)
