import { create } from 'zustand'
import type { Project } from '../../shared/types'

interface ProjectsState {
  projects: Project[]
  loading: boolean
  load: () => Promise<void>
  add: () => Promise<Project | null>
  remove: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const projects = await window.api.projects.list()
      set({ projects, loading: false })
    } catch (err) {
      console.error('failed to load projects', err)
      set({ loading: false })
    }
  },
  add: async () => {
    const added = await window.api.projects.add()
    if (added) await get().load()
    return added
  },
  remove: async (id) => {
    await window.api.projects.remove(id)
    await get().load()
  }
}))
