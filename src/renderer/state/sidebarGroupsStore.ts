import { create } from 'zustand'
import type { SidebarLayout } from '../../shared/sidebarGroups'

interface SidebarGroupsState {
  /** undefined until read; null when nothing is saved yet, so the list seeds one. */
  saved: SidebarLayout | null | undefined
  init: () => void
  /** Shows the layout at once and saves it. */
  commit: (layout: SidebarLayout) => void
}

let started = false

export const useSidebarGroupsStore = create<SidebarGroupsState>((set, get) => ({
  saved: undefined,
  init: () => {
    if (started) return
    started = true
    window.api.sidebarGroups
      .load()
      .then((saved) => {
        if (get().saved === undefined) set({ saved })
      })
      .catch((err) => {
        console.error('could not read the sidebar groups', err)
        if (get().saved === undefined) set({ saved: null })
      })
  },
  commit: (layout) => {
    if (get().saved === layout) return
    set({ saved: layout })
    window.api.sidebarGroups.save(layout).catch((err) => console.error('could not save the sidebar groups', err))
  }
}))
