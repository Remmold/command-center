import { create } from 'zustand'
import type { SessionStatusEntry, Workspace } from '../../shared/types'
import { needsYouQueue, nextWaiting } from '../../shared/needsYou'
import { chatOnScreen, type ShellOptions } from './projectViewLayout'
import { useProjectViewsStore, type ProjectView, type ShellTab } from './projectViewsStore'
import { useSessionStatusStore } from './sessionStatusStore'
import { useViewStore } from './viewStore'
import { useObservedStore } from './observedStore'

export const NEXT_WAITING_SHORTCUT = 'Ctrl+J'

export interface HostedSessionRef {
  paneId: string
  projectId: string
  title: string
}

export function hostedSessions(views: Record<string, ProjectView>): HostedSessionRef[] {
  return Object.values(views).flatMap((v) =>
    v.claudeSessions.map((c) => ({ paneId: c.id, projectId: v.projectId, title: c.title }))
  )
}

export function paneOnScreen(): string | null {
  const screen = useViewStore.getState()
  if (screen.view !== 'work' || screen.settings !== null) return null
  if (useObservedStore.getState().viewing) return null
  const { views, activeProjectId } = useProjectViewsStore.getState()
  const view = activeProjectId ? views[activeProjectId] : undefined
  if (!view || !chatOnScreen(view)) return null
  return view.activeClaudeSessionId
}

interface FocusRequestState {
  request: { paneId: string; nonce: number } | null
  requestFocus: (paneId: string) => void
  clear: () => void
}

/** Asks a chat to focus its approval prompt, or its input when nothing awaits approval. */
export const useFocusRequestStore = create<FocusRequestState>((set, get) => ({
  request: null,
  requestFocus: (paneId) => set({ request: { paneId, nonce: (get().request?.nonce ?? 0) + 1 } }),
  clear: () => set({ request: null })
}))

/** Brings a hosted session's chat on screen in Work; `focus: false` leaves keyboard focus where it is. */
export function openSession(paneId: string, { focus = true }: { focus?: boolean } = {}): boolean {
  const views = useProjectViewsStore.getState()
  const target = hostedSessions(views.views).find((s) => s.paneId === paneId)
  if (!target) return false
  useViewStore.getState().setView('work')
  useObservedStore.getState().close()
  views.setActive(target.projectId)
  views.setActiveClaudeSession(target.projectId, paneId)
  views.setCenterView(target.projectId, 'chat')
  if (focus) useFocusRequestStore.getState().requestFocus(paneId)
  return true
}

/** Switches to Work on a workspace, opening it like a sidebar click when it has no view yet. */
export function openWorkspace(workspace: Workspace): void {
  useViewStore.getState().setView('work')
  useProjectViewsStore.getState().openProject(workspace)
}

/** Opens a new shell in the workspace's shell drawer, bringing the workspace on screen first. */
export function openShell(
  workspace: Workspace,
  options?: ShellOptions
): ShellTab | null {
  openWorkspace(workspace)
  return useProjectViewsStore.getState().openShell(workspace.id, options)
}

export interface QueuedSession extends HostedSessionRef {
  entry: SessionStatusEntry
}

export function waitingQueue(
  views: Record<string, ProjectView>,
  byPane: Record<string, SessionStatusEntry>
): QueuedSession[] {
  const hosted = new Map(hostedSessions(views).map((s) => [s.paneId, s]))
  const entries = Object.values(byPane).filter((e) => hosted.has(e.paneId))
  return needsYouQueue(entries).map((entry) => ({ ...hosted.get(entry.paneId)!, entry }))
}

export function jumpToNextWaiting(): void {
  const queue = waitingQueue(useProjectViewsStore.getState().views, useSessionStatusStore.getState().byPane)
  const next = nextWaiting(
    queue.map((q) => q.entry),
    paneOnScreen()
  )
  if (next) openSession(next.paneId)
}
