import { create } from 'zustand'
import type { Model3dView } from '../../shared/model3d'

interface Model3dState {
  /** Null until main has answered once. */
  view: Model3dView | null
  /** Stop server's last refusal, shown until the next try. */
  stopError: string | null
  /** Loads the view and follows main's changes; returns the stop. */
  follow: () => () => void
  stopServer: () => Promise<void>
}

export const useModel3dStore = create<Model3dState>((set) => ({
  view: null,
  stopError: null,
  follow: () => {
    let live = true
    const off = window.api.model3d.onChanged((view) => set({ view }))
    void window.api.model3d.view().then((view) => {
      if (live) set((s) => (s.view ? {} : { view }))
    })
    return () => {
      live = false
      off()
    }
  },
  stopServer: async () => {
    set({ stopError: null })
    const result = await window.api.model3d.stopServer()
    if (!result.ok) set({ stopError: result.error })
  }
}))
