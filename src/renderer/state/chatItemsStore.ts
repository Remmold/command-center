import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatItem } from '../components/chat/types'

interface ChatItemsState {
  items: Record<string, ChatItem[]>
  appendItems: (paneId: string, newItems: ChatItem[]) => void
  setItems: (paneId: string, items: ChatItem[]) => void
  clearItems: (paneId: string) => void
  deletePane: (paneId: string) => void
}

export const useChatItemsStore = create<ChatItemsState>()(
  persist(
    (set) => ({
      items: {},
      appendItems: (paneId, newItems) =>
        set((s) => ({
          items: {
            ...s.items,
            [paneId]: [...(s.items[paneId] ?? []), ...newItems]
          }
        })),
      setItems: (paneId, items) =>
        set((s) => ({ items: { ...s.items, [paneId]: items } })),
      clearItems: (paneId) =>
        set((s) => ({ items: { ...s.items, [paneId]: [] } })),
      deletePane: (paneId) =>
        set((s) => {
          const next = { ...s.items }
          delete next[paneId]
          return { items: next }
        })
    }),
    {
      name: 'command-center.chat-items',
      storage: createJSONStorage(() => localStorage),
      version: 1
    }
  )
)
