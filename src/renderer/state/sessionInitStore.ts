import { useEffect } from 'react'
import { create } from 'zustand'
import type { SessionInit } from '../../shared/types'

interface SessionInitState {
  byPane: Record<string, SessionInit>
  initialized: boolean
  init: () => void
  load: (paneId: string) => void
}

export const useSessionInitStore = create<SessionInitState>((set, get) => ({
  byPane: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.claude.onInit(({ paneId, init }) =>
      set((s) => ({ byPane: { ...s.byPane, [paneId]: init } }))
    )
  },
  load: (paneId) => {
    if (get().byPane[paneId]) return
    window.api.claude
      .getInit(paneId)
      .then((init) => {
        if (!init || get().byPane[paneId]) return
        set((s) => ({ byPane: { ...s.byPane, [paneId]: init } }))
      })
      .catch((err) => console.error('failed to load session init', err))
  }
}))

/** The pane's handshake data, or null until its CLI has replied. */
export function useSessionInit(paneId: string): SessionInit | null {
  const init = useSessionInitStore((s) => s.byPane[paneId] ?? null)
  const load = useSessionInitStore((s) => s.load)
  useEffect(() => {
    load(paneId)
  }, [paneId, load])
  return init
}
