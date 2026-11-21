import { create } from 'zustand'
import type { ApprovalRequest } from '../../shared/approval'

interface ApprovalsState {
  /** Open approval requests per pane, oldest first. */
  byPane: Record<string, ApprovalRequest[]>
  initialized: boolean
  init: () => void
  /** Removes the request here at once; main confirms with a settled event. */
  remove: (requestId: string) => void
}

export const useApprovalsStore = create<ApprovalsState>((set, get) => ({
  byPane: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    const add = (request: ApprovalRequest): void =>
      set((s) => {
        const list = s.byPane[request.paneId] ?? []
        if (list.some((r) => r.requestId === request.requestId)) return s
        return { byPane: { ...s.byPane, [request.paneId]: [...list, request] } }
      })
    window.api.approval.onRequest(add)
    window.api.approval.onSettled(({ requestId }) => get().remove(requestId))
    window.api.approval
      .list()
      .then((open) => open.forEach(add))
      .catch((err) => console.error('failed to load open approvals', err))
  },
  remove: (requestId) =>
    set((s) => {
      const next: Record<string, ApprovalRequest[]> = {}
      for (const [pane, list] of Object.entries(s.byPane)) next[pane] = list.filter((r) => r.requestId !== requestId)
      return { byPane: next }
    })
}))
