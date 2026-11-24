import { create } from 'zustand'
import type { AddWorkspaceResult, Workspace } from '../../shared/types'
import { moveWorkspace } from './accounts'

interface WorkspacesState {
  workspaces: Workspace[]
  loading: boolean
  /** The first load has finished, whatever its outcome. */
  loaded: boolean
  load: () => Promise<void>
  add: () => Promise<Workspace | null>
  addPath: (path: string) => Promise<AddWorkspaceResult>
  remove: (id: string) => Promise<void>
  /** Takes effect from the workspace's next session start. */
  setProfile: (id: string, profileId: string) => Promise<void>
  /** Drops `moved` where `target` is; the order is saved and every list follows it. */
  move: (moved: string, target: string) => Promise<void>
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  loading: false,
  loaded: false,
  load: async () => {
    set({ loading: true })
    try {
      const workspaces = await window.api.workspaces.list()
      set({ workspaces, loading: false, loaded: true })
    } catch (err) {
      console.error('failed to load workspaces', err)
      set({ loading: false, loaded: true })
    }
  },
  add: async () => {
    const added = await window.api.workspaces.add()
    if (added) await get().load()
    return added
  },
  addPath: async (path) => {
    const result = await window.api.workspaces.addPath(path)
    if (result.ok) await get().load()
    return result
  },
  remove: async (id) => {
    await window.api.workspaces.remove(id)
    await get().load()
  },
  setProfile: async (id, profileId) => {
    const updated = await window.api.workspaces.setProfile(id, profileId)
    if (!updated) return
    const moved = get().workspaces.find((w) => w.id === id)?.profileId !== profileId
    const workspaces = get().workspaces.map((w) => (w.id === id ? updated : w))
    set({ workspaces: moved ? [...workspaces.filter((w) => w.id !== id), updated] : workspaces })
  },
  move: async (moved, target) => {
    const before = get().workspaces
    const ids = moveWorkspace(before.map((w) => w.id), moved, target)
    const byId = new Map(before.map((w) => [w.id, w]))
    set({ workspaces: ids.flatMap((id) => byId.get(id) ?? []) })
    try {
      set({ workspaces: await window.api.workspaces.reorder(ids) })
    } catch (err) {
      console.error('failed to save workspace order', err)
      set({ workspaces: before })
    }
  }
}))
