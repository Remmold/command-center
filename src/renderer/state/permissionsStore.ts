import { create } from 'zustand'
import type { PermissionRequest } from '../../shared/types'

interface PermissionsState {
  /** Pending permission requests keyed by paneId, with newest at the end. */
  requestsByPane: Record<string, PermissionRequest[]>
  addRequest: (request: PermissionRequest) => void
  resolveRequest: (requestId: string) => void
  clearPane: (paneId: string) => void
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  requestsByPane: {},
  addRequest: (request) =>
    set((s) => {
      const list = s.requestsByPane[request.paneId] ?? []
      if (list.some((r) => r.requestId === request.requestId)) return s
      return {
        requestsByPane: {
          ...s.requestsByPane,
          [request.paneId]: [...list, request]
        }
      }
    }),
  resolveRequest: (requestId) =>
    set((s) => {
      const next: Record<string, PermissionRequest[]> = {}
      for (const [pane, list] of Object.entries(s.requestsByPane)) {
        next[pane] = list.filter((r) => r.requestId !== requestId)
      }
      return { requestsByPane: next }
    }),
  clearPane: (paneId) =>
    set((s) => {
      if (!s.requestsByPane[paneId]) return s
      const next = { ...s.requestsByPane }
      delete next[paneId]
      return { requestsByPane: next }
    })
}))
