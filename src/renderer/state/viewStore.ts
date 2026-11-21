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

export const useViewStore = create<ViewState>((set, get) => ({
  view: DEFAULT_VIEW,
  settings: null,
  setView: (view) => set({ view, settings: null }),
  openSettings: (section) => set({ settings: section ?? get().settings ?? 'workspaces' }),
  closeSettings: () => set({ settings: null })
}))
