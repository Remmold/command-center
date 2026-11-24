import { create } from 'zustand'
import type { ContextReport } from '../../shared/context'

interface ContextState {
  selectedId: string | null
  /** The selected workspace's report; null until it is read. */
  report: ContextReport | null
  /** Start totals by workspace id; null where the folder is gone. */
  totals: Record<string, number | null>
  /** Picks the workspace, then reads everything again. */
  select: (workspaceId: string | null) => void
  /** Reads the selected workspace's report and every start total again. */
  refresh: () => void
}

export const useContextStore = create<ContextState>((set, get) => ({
  selectedId: null,
  report: null,
  totals: {},
  select: (workspaceId) => {
    if (workspaceId !== get().selectedId) set({ selectedId: workspaceId, report: null })
    get().refresh()
  },
  refresh: () => {
    const { selectedId } = get()
    if (selectedId) {
      window.api.context.report(selectedId).then(
        (report) => {
          if (get().selectedId === selectedId) set({ report })
        },
        (err) => console.error('[context] could not read the report', err)
      )
    }
    window.api.context.startTotals().then(
      (totals) => set({ totals }),
      (err) => console.error('[context] could not read the start totals', err)
    )
  }
}))
