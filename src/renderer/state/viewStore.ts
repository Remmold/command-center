import { create } from 'zustand'
import { DEFAULT_VIEW, type AppView } from '../../shared/views'

export type { AppView }

export type SettingsSection = 'workspaces' | 'accounts' | 'apps' | 'board' | 'general'

interface ViewState {
  view: AppView
  /** The open Settings section, or null while Settings is closed. Settings overlays the view. */
  settings: SettingsSection | null
  setView: (view: AppView) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
}

let leaveGuard: (() => boolean) | null = null

/** A view with unsaved edits asks before the app shows another one; the guard returns false to stay. */
export function setViewLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard
}

export const useViewStore = create<ViewState>((set, get) => ({
  view: DEFAULT_VIEW,
  settings: null,
  setView: (view) => {
    if (view !== get().view && leaveGuard && !leaveGuard()) return
    set({ view, settings: null })
  },
  openSettings: (section) => set({ settings: section ?? get().settings ?? 'workspaces' }),
  closeSettings: () => set({ settings: null })
}))
