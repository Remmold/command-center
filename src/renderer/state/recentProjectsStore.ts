import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { touchRecent, type RecentProjects } from './projectPicker'

interface RecentProjectsState {
  recent: RecentProjects
  touch: (workspaceId: string) => void
}

export const useRecentProjectsStore = create<RecentProjectsState>()(
  persist(
    (set) => ({
      recent: {},
      touch: (workspaceId) => set((s) => ({ recent: touchRecent(s.recent, workspaceId, Date.now()) }))
    }),
    { name: 'command-center.recent-projects', storage: createJSONStorage(() => localStorage) }
  )
)
