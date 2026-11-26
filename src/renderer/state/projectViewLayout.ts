import type { PtyKind } from '../../shared/types'
import type { ProjectView } from './projectViewsStore'

export const LAYOUT_VERSION = 13

interface SavedLayout {
  idePanelsOpen?: unknown
  shellDrawerOpen?: unknown
  bottomPanelOpen?: unknown
  shellTabs?: unknown
  activeShellTabId?: unknown
}

/** Mutates the saved views in place, like the store's other migration steps. */
export function migrateLayout(persisted: { views?: Record<string, SavedLayout> }, fromVersion: number): void {
  if (fromVersion >= LAYOUT_VERSION) return
  for (const v of Object.values(persisted.views ?? {})) {
    if (typeof v.idePanelsOpen !== 'boolean') v.idePanelsOpen = false
    if (typeof v.shellDrawerOpen !== 'boolean') v.shellDrawerOpen = false
    delete v.bottomPanelOpen
    // Tabs saved as whole shells name ptys that ended with the app that ran them.
    if (Array.isArray(v.shellTabs) && v.shellTabs.some((t) => typeof t !== 'string')) {
      v.shellTabs = []
      v.activeShellTabId = null
    }
  }
}

export function toggleIdePanels(view: ProjectView): ProjectView {
  return { ...view, idePanelsOpen: !view.idePanelsOpen }
}

/** Drops what can't survive a restart: file buffers and diffs are re-read on demand. */
export function persistableView(view: ProjectView): ProjectView {
  return {
    ...view,
    openFiles: [],
    activeFilePath: null,
    openDiffs: [],
    activeDiffId: null,
    centerView: view.centerView === 'diff' ? 'chat' : (view.centerView ?? 'chat')
  }
}

export interface ShellOptions {
  kind?: PtyKind
  /** Extra variables for the shell's process, on top of the app's own environment. */
  env?: Record<string, string>
}

/** Shows terminal `id` as the drawer's focused tab. */
export function openShellTab(view: ProjectView, id: string): ProjectView {
  return {
    ...view,
    shellTabs: view.shellTabs.includes(id) ? view.shellTabs : [...view.shellTabs, id],
    activeShellTabId: id,
    shellDrawerOpen: true
  }
}

/** Takes terminals off the drawer only; the terminals themselves keep running (ADR 0006). */
export function dropShellTabs(view: ProjectView, gone: (id: string) => boolean): ProjectView {
  const remaining = view.shellTabs.filter((id) => !gone(id))
  if (remaining.length === view.shellTabs.length) return view
  const activeShellTabId =
    view.activeShellTabId !== null && remaining.includes(view.activeShellTabId)
      ? view.activeShellTabId
      : (remaining[remaining.length - 1] ?? null)
  return {
    ...view,
    shellTabs: remaining,
    activeShellTabId,
    shellDrawerOpen: remaining.length === 0 ? false : view.shellDrawerOpen
  }
}

/** With the IDE panels closed the chat fills the workspace, whatever editor tab was last picked. */
export function chatOnScreen(view: ProjectView): boolean {
  return !view.idePanelsOpen || view.centerView === 'chat'
}
