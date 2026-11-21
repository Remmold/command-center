import { create } from 'zustand'
import type { Workspace } from '../../shared/types'

export type PickPurpose = 'new-session' | 'past-sessions'

interface LauncherState {
  /** Why the workspace picker is open; null while it is closed. */
  picking: PickPurpose | null
  /** The workspace whose past sessions are listed. */
  pastFor: Workspace | null
  pickWorkspace: (purpose: PickPurpose) => void
  closePicker: () => void
  showPastSessions: (workspace: Workspace) => void
  closePastSessions: () => void
}

export const useLauncherStore = create<LauncherState>((set) => ({
  picking: null,
  pastFor: null,
  pickWorkspace: (purpose) => set({ picking: purpose, pastFor: null }),
  closePicker: () => set({ picking: null }),
  showPastSessions: (workspace) => set({ pastFor: workspace }),
  closePastSessions: () => set({ pastFor: null })
}))
