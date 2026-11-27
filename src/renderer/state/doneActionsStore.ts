import { create } from 'zustand'

interface DoneActionsState {
  keys: ReadonlySet<string>
  remember: (key: string) => void
  /** The conversation the cards were in has gone; a new one may reuse its message ids. */
  forget: () => void
}

/** Cards this app session carried out, by `actionKey`; the live card then reads Done. In memory only: a restart derives the state from the facts. */
export const useDoneActionsStore = create<DoneActionsState>((set) => ({
  keys: new Set(),
  remember: (key) => set((s) => ({ keys: new Set(s.keys).add(key) })),
  forget: () => set({ keys: new Set() })
}))
