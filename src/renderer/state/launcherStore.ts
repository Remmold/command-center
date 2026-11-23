import { create } from 'zustand'
import { startStep, type PickerStep } from './projectPicker'
import { focusedTarget } from './sessionNavigation'
import { useWorkspacesStore } from './workspacesStore'

interface LauncherState {
  /** The step the project picker opened at; null while it is closed. */
  opened: PickerStep | null
  /** Bumped on every open, so reopening at the same step starts afresh. */
  openCount: number
  open: (step: PickerStep) => void
  close: () => void
}

export const useLauncherStore = create<LauncherState>((set) => ({
  opened: null,
  openCount: 0,
  open: (step) => set((s) => ({ opened: step, openCount: s.openCount + 1 })),
  close: () => set({ opened: null })
}))

/** + New session and Ctrl+T: the project list. */
export function pickProject(): void {
  useLauncherStore.getState().open({ kind: 'projects' })
}

/** Past sessions… and Ctrl+L: the sessions of the given project, else of the focused chat's, else the project list. */
export function pickPastSession(workspaceId: string | null = focusedTarget()?.workspaceId ?? null): void {
  useLauncherStore.getState().open(startStep(workspaceId, useWorkspacesStore.getState().workspaces))
}
