import { useMemo } from 'react'
import { create } from 'zustand'
import type { SessionStatusEntry } from '../../shared/types'
import { useObservedStore } from './observedStore'
import { useProjectViewsStore, type ProjectView } from './projectViewsStore'
import { useRepoIdentitiesStore } from './repoIdentitiesStore'
import { openSession } from './sessionNavigation'
import { sessionList, type HostedSessionInput, type SessionGroup, type SessionListInput, type SessionRow } from './sessionList'
import { useSessionStatusStore } from './sessionStatusStore'
import { useViewStore } from './viewStore'
import { useWorkspacesStore } from './workspacesStore'

interface WorkSearchState {
  search: string
  setSearch: (search: string) => void
}

export const useWorkSearchStore = create<WorkSearchState>((set) => ({
  search: '',
  setSearch: (search) => set({ search })
}))

/** A hosted session's most recent activity is when its status last changed. */
function hostedInputs(views: Record<string, ProjectView>, byPane: Record<string, SessionStatusEntry>): HostedSessionInput[] {
  return Object.values(views).flatMap((v) =>
    v.claudeSessions.map((c) => ({
      paneId: c.id,
      workspaceId: v.projectId,
      title: c.title,
      lastActivityAt: byPane[c.id]?.since ?? 0
    }))
  )
}

function listInput(): SessionListInput {
  const byPane = useSessionStatusStore.getState().byPane
  return {
    hosted: hostedInputs(useProjectViewsStore.getState().views, byPane),
    statuses: Object.values(byPane),
    observed: useObservedStore.getState().sessions,
    workspaces: useWorkspacesStore.getState().workspaces,
    identities: useRepoIdentitiesStore.getState().identities,
    search: useWorkSearchStore.getState().search
  }
}

export function useSessionGroups(): SessionGroup[] {
  const views = useProjectViewsStore((s) => s.views)
  const byPane = useSessionStatusStore((s) => s.byPane)
  const observed = useObservedStore((s) => s.sessions)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const search = useWorkSearchStore((s) => s.search)
  return useMemo(
    () =>
      sessionList({
        hosted: hostedInputs(views, byPane),
        statuses: Object.values(byPane),
        observed,
        workspaces,
        identities,
        search
      }),
    [views, byPane, observed, workspaces, identities, search]
  )
}

export type OpenTarget =
  | { kind: 'hosted'; workspaceId: string; paneId: string }
  | { kind: 'observed'; workspaceId: string; sessionId: string }
  | null

export function useOpenTarget(): OpenTarget {
  const viewing = useObservedStore((s) => s.viewing)
  const workspaceId = useProjectViewsStore((s) => s.activeProjectId)
  const paneId = useProjectViewsStore((s) => (s.activeProjectId ? s.views[s.activeProjectId]?.activeClaudeSessionId : null))
  return useMemo(() => {
    if (viewing) return { kind: 'observed', ...viewing }
    return workspaceId && paneId ? { kind: 'hosted', workspaceId, paneId } : null
  }, [viewing, workspaceId, paneId])
}

export function isOpen(row: SessionRow, target: OpenTarget): boolean {
  if (!target || row.kind !== target.kind) return false
  if (row.kind === 'hosted') return target.kind === 'hosted' && row.paneId === target.paneId
  return target.kind === 'observed' && row.workspace.id === target.workspaceId && row.sessionId === target.sessionId
}

export function openRow(row: SessionRow, options?: { focus?: boolean }): void {
  if (row.kind === 'hosted') {
    openSession(row.paneId, options)
    return
  }
  useViewStore.getState().setView('work')
  void useObservedStore.getState().open(row.workspace, row.sessionId)
}

/** Opens the list's nth row as it is shown, search applied. */
export function openRowAt(index: number): void {
  const row = sessionList(listInput()).flatMap((g) => g.rows)[index]
  if (row) openRow(row)
}
