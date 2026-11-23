import { create } from 'zustand'
import type { LocalSessionInfo } from '../../shared/types'
import { useToastStore } from './toastStore'

type TitleChange = Pick<LocalSessionInfo, 'title' | 'titleSource'>

interface PastSessionsState {
  /** The last listing per workspace folder, shown at once while a fresh one loads. */
  byCwd: Record<string, LocalSessionInfo[]>
  /** Only for a folder with no listing yet; a failed refresh of a shown list is a toast. */
  errorByCwd: Record<string, string>
  refresh: (cwd: string) => Promise<void>
  retitle: (cwd: string, sessionId: string, change: TitleChange) => void
}

const latestRequest = new Map<string, number>()

export const usePastSessionsStore = create<PastSessionsState>((set, get) => ({
  byCwd: {},
  errorByCwd: {},
  refresh: async (cwd) => {
    const request = (latestRequest.get(cwd) ?? 0) + 1
    latestRequest.set(cwd, request)
    try {
      const sessions = await window.api.claude.listLocalSessions(cwd)
      if (latestRequest.get(cwd) !== request) return
      set((s) => {
        const { [cwd]: _cleared, ...errorByCwd } = s.errorByCwd
        return { byCwd: { ...s.byCwd, [cwd]: sessions }, errorByCwd }
      })
    } catch (err) {
      if (latestRequest.get(cwd) !== request) return
      const message = (err as Error).message ?? 'failed to list sessions'
      if (get().byCwd[cwd]) useToastStore.getState().show(`Could not refresh sessions: ${message}`)
      else set((s) => ({ errorByCwd: { ...s.errorByCwd, [cwd]: message } }))
    }
  },
  retitle: (cwd, sessionId, change) =>
    set((s) => ({
      byCwd: { ...s.byCwd, [cwd]: (s.byCwd[cwd] ?? []).map((x) => (x.sessionId === sessionId ? { ...x, ...change } : x)) }
    }))
}))
