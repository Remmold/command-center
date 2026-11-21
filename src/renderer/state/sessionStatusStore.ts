import { useMemo } from 'react'
import { create } from 'zustand'
import type { SessionStatus, SessionStatusEntry } from '../../shared/types'
import { mostUrgentStatus } from '../../shared/needsYou'
import { useProjectViewsStore } from './projectViewsStore'

interface SessionStatusState {
  byPane: Record<string, SessionStatusEntry>
  initialized: boolean
  init: () => void
}

export const useSessionStatusStore = create<SessionStatusState>((set, get) => ({
  byPane: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.sessionStatus.onChanged((entry) =>
      set((s) => ({ byPane: { ...s.byPane, [entry.paneId]: entry } }))
    )
    window.api.sessionStatus
      .list()
      .then((entries) =>
        set((s) => {
          const byPane = { ...s.byPane }
          for (const e of entries) {
            const known = byPane[e.paneId]
            if (!known || known.since <= e.since) byPane[e.paneId] = e
          }
          return { byPane }
        })
      )
      .catch((err) => console.error('failed to load session statuses', err))
  }
}))

export function usePaneStatus(paneId: string): SessionStatus {
  return useSessionStatusStore((s) => s.byPane[paneId]?.status ?? 'idle')
}

/** The most urgent status among these workspaces' hosted sessions; null when none of them is open. */
export function useWorkspacesStatus(workspaceIds: readonly string[]): SessionStatus | null {
  const views = useProjectViewsStore((s) => s.views)
  return useSessionStatusStore((s) => {
    const open = workspaceIds.flatMap((id) => views[id]?.claudeSessions ?? [])
    const anyOpen = workspaceIds.some((id) => views[id])
    return anyOpen ? mostUrgentStatus(open.map((c) => s.byPane[c.id]?.status ?? 'idle')) : null
  })
}

/** Statuses of each workspace's hosted sessions, by workspace id. */
export function useStatusesByWorkspace(): Record<string, SessionStatus[]> {
  const views = useProjectViewsStore((s) => s.views)
  const byPane = useSessionStatusStore((s) => s.byPane)
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(views).map(([id, view]) => [id, view.claudeSessions.map((c) => byPane[c.id]?.status ?? 'idle')])
      ),
    [views, byPane]
  )
}
