import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SessionListState {
  /** Whether Work shows its session list; Ctrl+B flips it, as VS Code's sidebar. */
  open: boolean
  toggle: () => void
}

export const useSessionListStore = create<SessionListState>()(
  persist(
    (set) => ({
      open: true,
      toggle: () => set((s) => ({ open: !s.open }))
    }),
    {
      name: 'command-center.session-list',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ open: s.open })
    }
  )
)
