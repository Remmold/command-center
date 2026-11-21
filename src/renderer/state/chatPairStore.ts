import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { EMPTY_PAIR, restorePair, type ChatPair } from './chatPair'

interface ChatPairState {
  pair: ChatPair
  setPair: (pair: ChatPair) => void
}

/** The chat, or the two chats, on screen in Work; kept across restarts. */
export const useChatPairStore = create<ChatPairState>()(
  persist(
    (set) => ({
      pair: EMPTY_PAIR,
      setPair: (pair) => set({ pair })
    }),
    {
      name: 'command-center.chat-pair',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ pair: s.pair }),
      merge: (saved, current) => ({ ...current, pair: restorePair((saved as { pair?: unknown } | undefined)?.pair) })
    }
  )
)
