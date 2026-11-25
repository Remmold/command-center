import { create } from 'zustand'
import type { BackgroundProcess } from '../../shared/backgroundProcesses'

interface BackgroundProcessesState {
  /** Each hosted session's background processes, running ones first, as main tracks them. */
  byPane: Record<string, BackgroundProcess[]>
  /** The CLI's error for a Stop that failed, by pane and task id. */
  stopErrors: Record<string, Record<string, string>>
  initialized: boolean
  init: () => void
  stop: (paneId: string, taskId: string) => Promise<void>
}

const NO_ERRORS: Record<string, string> = {}

export const useBackgroundProcessesStore = create<BackgroundProcessesState>((set, get) => ({
  byPane: {},
  stopErrors: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.backgroundProcesses.onChanged(({ paneId, processes }) =>
      set((s) => {
        const byPane = { ...s.byPane }
        const stopErrors = { ...s.stopErrors }
        if (processes.length > 0) byPane[paneId] = processes
        else {
          delete byPane[paneId]
          delete stopErrors[paneId]
        }
        return { byPane, stopErrors }
      })
    )
    window.api.backgroundProcesses
      .list()
      .then((entries) =>
        set((s) => {
          const byPane = { ...s.byPane }
          for (const e of entries) byPane[e.paneId] ??= e.processes
          return { byPane }
        })
      )
      .catch((err) => console.error('failed to load background processes', err))
  },
  stop: async (paneId, taskId) => {
    const clear = (s: BackgroundProcessesState) => {
      const { [taskId]: _gone, ...rest } = s.stopErrors[paneId] ?? NO_ERRORS
      return { stopErrors: { ...s.stopErrors, [paneId]: rest } }
    }
    set(clear)
    const res = await window.api.claude.control(paneId, 'stop_task', { task_id: taskId })
    // The session may have closed while the stop was in flight.
    if (!res.ok && get().byPane[paneId]) set((s) => ({ stopErrors: { ...s.stopErrors, [paneId]: { ...(s.stopErrors[paneId] ?? NO_ERRORS), [taskId]: res.error } } }))
  }
}))

const NONE: BackgroundProcess[] = []

export function usePaneProcesses(paneId: string): BackgroundProcess[] {
  return useBackgroundProcessesStore((s) => s.byPane[paneId] ?? NONE)
}

export function useStopErrors(paneId: string): Record<string, string> {
  return useBackgroundProcessesStore((s) => s.stopErrors[paneId] ?? NO_ERRORS)
}
