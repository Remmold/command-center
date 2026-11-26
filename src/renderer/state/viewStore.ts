import { create } from 'zustand'
import { DEFAULT_VIEW, type AppView } from '../../shared/views'

export type { AppView }

export type SettingsSection = 'workspaces' | 'accounts' | 'claude-code' | 'apps' | 'board' | 'preview' | 'general'

interface ViewState {
  view: AppView
  /** The open Settings section, or null while Settings is closed. Settings overlays the view. */
  settings: SettingsSection | null
  setView: (view: AppView) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
}

let leaveGuard: (() => boolean) | null = null
let settingsLeaveGuard: (() => boolean) | null = null

/** A view with unsaved edits asks before the app shows another one; the guard returns false to stay. */
export function setViewLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard
}

/** A Settings section with unsaved edits asks before another section, the view or closing Settings replaces it. */
export function setSettingsLeaveGuard(guard: (() => boolean) | null): void {
  settingsLeaveGuard = guard
}

const mayLeaveSettings = (): boolean => !settingsLeaveGuard || settingsLeaveGuard()

export const useViewStore = create<ViewState>((set, get) => ({
  view: DEFAULT_VIEW,
  settings: null,
  setView: (view) => {
    if (get().settings && !mayLeaveSettings()) return
    if (view !== get().view && leaveGuard && !leaveGuard()) return
    set({ view, settings: null })
  },
  openSettings: (section) => {
    const current = get().settings
    const next = section ?? current ?? 'workspaces'
    if (current && next !== current && !mayLeaveSettings()) return
    set({ settings: next })
  },
  closeSettings: () => {
    if (get().settings && !mayLeaveSettings()) return
    set({ settings: null })
  }
}))
