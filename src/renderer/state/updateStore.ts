import { create } from 'zustand'
import type { UpdateStatus } from '../../shared/types'

interface UpdateState {
  status: UpdateStatus | null
  /** Busy chats named by a Restart to update click, until it is answered. */
  confirming: string[] | null
  init: () => void
  check: () => Promise<void>
  restart: (force: boolean) => Promise<void>
  setAutoRestart: (on: boolean) => Promise<void>
  cancel: () => void
}

let initialized = false

export const useUpdateStore = create<UpdateState>()((set) => ({
  status: null,
  confirming: null,
  init: () => {
    if (initialized) return
    initialized = true
    void window.api.update.status().then((status) => set({ status }))
    window.api.update.onChanged((status) => set({ status }))
  },
  check: () => window.api.update.check(),
  restart: async (force) => {
    const reply = await window.api.update.restart(force)
    set({ confirming: reply.kind === 'confirm' ? reply.busy : null })
  },
  setAutoRestart: (on) => window.api.update.setAutoRestart(on),
  cancel: () => set({ confirming: null })
}))
