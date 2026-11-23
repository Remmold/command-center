import { useEffect } from 'react'
import { create } from 'zustand'
import type { CliAccount, SessionInit } from '../../shared/types'
import type { ChatProcess } from './chatAccount'

interface SessionInitState {
  byPane: Record<string, SessionInit>
  /** The account each profile's latest `initialize` reply named. */
  accountByProfile: Record<string, CliAccount>
  /** Each running pane's start profile and, once `initialize` replied, the account it reported. */
  processByPane: Record<string, ChatProcess>
  initialized: boolean
  init: () => void
  load: (paneId: string) => void
  started: (paneId: string, profileId: string) => void
  loadProcess: (paneId: string) => void
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const { [key]: _gone, ...rest } = record
  return rest
}

export const useSessionInitStore = create<SessionInitState>((set, get) => ({
  byPane: {},
  accountByProfile: {},
  processByPane: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.claude.onInit(({ paneId, profileId, init }) =>
      set((s) => ({
        byPane: { ...s.byPane, [paneId]: init },
        accountByProfile: init.account ? { ...s.accountByProfile, [profileId]: init.account } : s.accountByProfile,
        processByPane: { ...s.processByPane, [paneId]: { profileId, account: init.account } }
      }))
    )
    window.api.claude.onExit(({ paneId }) => set((s) => ({ processByPane: without(s.processByPane, paneId) })))
  },
  started: (paneId, profileId) =>
    set((s) => {
      const known = s.processByPane[paneId]
      if (known?.profileId === profileId) return s
      return { processByPane: { ...s.processByPane, [paneId]: { profileId, account: null } } }
    }),
  loadProcess: (paneId) => {
    if (get().processByPane[paneId]) return
    void Promise.all([window.api.claude.processProfile(paneId), window.api.claude.getInit(paneId)])
      .then(([profileId, init]) => {
        if (!profileId || get().processByPane[paneId]) return
        set((s) => ({ processByPane: { ...s.processByPane, [paneId]: { profileId, account: init?.account ?? null } } }))
      })
      .catch((err) => console.error('failed to load the chat process', err))
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

/** The pane's running process, or null when none runs. */
export function useChatProcess(paneId: string): ChatProcess | null {
  const process = useSessionInitStore((s) => s.processByPane[paneId] ?? null)
  const load = useSessionInitStore((s) => s.loadProcess)
  useEffect(() => {
    load(paneId)
  }, [paneId, load])
  return process
}
