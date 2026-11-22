import type { PtyKind } from '../../shared/types'
import type { ProjectView, ShellTab } from './projectViewsStore'

export const LAYOUT_VERSION = 12

interface SavedLayout {
  idePanelsOpen?: unknown
  shellDrawerOpen?: unknown
  bottomPanelOpen?: unknown
}

/** Mutates the saved views in place, like the store's other migration steps. */
export function migrateLayout(persisted: { views?: Record<string, SavedLayout> }, fromVersion: number): void {
  if (fromVersion >= LAYOUT_VERSION) return
  for (const v of Object.values(persisted.views ?? {})) {
    if (typeof v.idePanelsOpen !== 'boolean') v.idePanelsOpen = false
    if (typeof v.shellDrawerOpen !== 'boolean') v.shellDrawerOpen = false
    delete v.bottomPanelOpen
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

export interface ShellRequest extends ShellOptions {
  id: string
  kind: PtyKind
}

function nextShellLabel(existing: ShellTab[], kind: PtyKind): string {
  const base = kind === 'pwsh' || kind === 'powershell' ? 'pwsh' : kind
  const sameKind = existing.filter((t) => t.kind === kind).length
  return sameKind === 0 ? base : `${base} ${sameKind + 1}`
}

export function openShellTab(view: ProjectView, request: ShellRequest): ProjectView {
  const tab: ShellTab = {
    id: request.id,
    label: nextShellLabel(view.shellTabs, request.kind),
    kind: request.kind,
    ...(request.env ? { env: request.env } : {})
  }
  return {
    ...view,
    shellTabs: [...view.shellTabs, tab],
    activeShellTabId: tab.id,
    shellDrawerOpen: true
  }
}

/** With the IDE panels closed the chat fills the workspace, whatever editor tab was last picked. */
export function chatOnScreen(view: ProjectView): boolean {
  return !view.idePanelsOpen || view.centerView === 'chat'
}
