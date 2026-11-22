import { create } from 'zustand'
import type { UpdateStatus } from '../../shared/types'
import { useProjectViewsStore } from './projectViewsStore'
import { saveOnUnload, savedView } from './restoreStore'
import { useViewStore } from './viewStore'

interface UpdateState {
  status: UpdateStatus | null
  /** Busy chats named by a Restart to update click, until it is answered. */
  confirming: string[] | null
  init: () => void
  check: () => Promise<void>
  restart: (force: boolean) => Promise<void>
  cancel: () => void
}

let initialized = false

export const useUpdateStore = create<UpdateState>()((set) => ({
  status: null,
  confirming: null,
  init: () => {
    if (initialized) return
    initialized = true
    saveOnUnload(() => ({
      view: useViewStore.getState().view,
      openPaneIds: Object.values(useProjectViewsStore.getState().views).flatMap((v) => v.claudeSessions.map((c) => c.id))
    }))
    void window.api.update.status().then((status) => {
      set({ status })
      const view = savedView()
      if (status.afterUpdate && view) useViewStore.getState().setView(view)
    })
    window.api.update.onChanged((status) => set({ status }))
  },
  check: () => window.api.update.check(),
  restart: async (force) => {
    const reply = await window.api.update.restart(force)
    set({ confirming: reply.kind === 'confirm' ? reply.busy : null })
  },
  cancel: () => set({ confirming: null })
}))
