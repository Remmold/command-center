import { create } from 'zustand'
import type { AppStatus, ManagedApp, ManagedAppInput } from '../../shared/types'

const MAX_LOG = 8000

interface AppsState {
  apps: ManagedApp[]
  status: Record<string, AppStatus>
  output: Record<string, string>
  showApps: boolean
  initialized: boolean
  setShowApps: (v: boolean) => void
  init: () => void
  load: () => Promise<void>
  refresh: () => Promise<void>
  start: (id: string, update?: boolean) => Promise<void>
  stop: (id: string) => Promise<void>
  restart: (id: string, update?: boolean) => Promise<void>
  add: (app: ManagedAppInput) => Promise<void>
  remove: (id: string) => Promise<void>
  clearOutput: (id: string) => void
}

export const useAppsStore = create<AppsState>((set, get) => ({
  apps: [],
  status: {},
  output: {},
  showApps: false,
  initialized: false,
  setShowApps: (v) => set({ showApps: v }),
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.apps.onOutput(({ id, data }) =>
      set((s) => ({
        output: { ...s.output, [id]: ((s.output[id] ?? '') + data).slice(-MAX_LOG) }
      }))
    )
    window.api.apps.onExit(() => {
      void get().refresh()
    })
    void get().load()
  },
  load: async () => {
    set({ apps: await window.api.apps.list() })
    await get().refresh()
  },
  refresh: async () => {
    const list = await window.api.apps.status()
    const status: Record<string, AppStatus> = {}
    for (const s of list) status[s.id] = s
    set({ status })
  },
  start: async (id, update) => {
    await window.api.apps.start(id, update)
    await get().refresh()
  },
  stop: async (id) => {
    await window.api.apps.stop(id)
    await get().refresh()
  },
  restart: async (id, update) => {
    await window.api.apps.stop(id)
    await window.api.apps.start(id, update)
    await get().refresh()
  },
  add: async (app) => {
    await window.api.apps.add(app)
    await get().load()
  },
  remove: async (id) => {
    await window.api.apps.remove(id)
    await get().load()
  },
  clearOutput: (id) => set((s) => ({ output: { ...s.output, [id]: '' } }))
}))
