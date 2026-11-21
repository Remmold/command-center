import { create } from 'zustand'
import type { AppView } from '../../shared/types'

export type { AppView }

interface ViewState {
  view: AppView
  setView: (view: AppView) => void
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'sessions',
  setView: (view) => set({ view })
}))
