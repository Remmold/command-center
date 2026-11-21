import { create } from 'zustand'

export type AppView = 'sessions' | 'board'

interface ViewState {
  view: AppView
  setView: (view: AppView) => void
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'sessions',
  setView: (view) => set({ view })
}))
