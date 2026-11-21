import { create } from 'zustand'
import type { Workspace } from '../../shared/types'

interface WorkspacesState {
  workspaces: Workspace[]
  loading: boolean
  load: () => Promise<void>
  add: () => Promise<Workspace | null>
  remove: (id: string) => Promise<void>
  /** Takes effect from the workspace's next session start. */
  setProfile: (id: string, profileId: string) => Promise<void>
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const workspaces = await window.api.workspaces.list()
      set({ workspaces, loading: false })
    } catch (err) {
      console.error('failed to load workspaces', err)
      set({ loading: false })
    }
  },
  add: async () => {
    const added = await window.api.workspaces.add()
    if (added) await get().load()
    return added
  },
  remove: async (id) => {
    await window.api.workspaces.remove(id)
    await get().load()
  },
  setProfile: async (id, profileId) => {
    const updated = await window.api.workspaces.setProfile(id, profileId)
    if (updated) set({ workspaces: get().workspaces.map((w) => (w.id === id ? updated : w)) })
  }
}))
