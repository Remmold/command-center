import { useEffect } from 'react'
import { create } from 'zustand'
import type { CliAccount, SessionInit } from '../../shared/types'

interface SessionInitState {
  byPane: Record<string, SessionInit>
  /** The account each profile's latest `initialize` reply named. */
  accountByProfile: Record<string, CliAccount>
  initialized: boolean
  init: () => void
  load: (paneId: string) => void
}

export const useSessionInitStore = create<SessionInitState>((set, get) => ({
  byPane: {},
  accountByProfile: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.claude.onInit(({ paneId, profileId, init }) =>
      set((s) => ({
        byPane: { ...s.byPane, [paneId]: init },
        accountByProfile: init.account ? { ...s.accountByProfile, [profileId]: init.account } : s.accountByProfile
      }))
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
