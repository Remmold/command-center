import { create } from 'zustand'
import type { Model3dActionResult, Model3dView } from '../../shared/model3d'

interface Model3dState {
  /** Null until main has answered once. */
  view: Model3dView | null
  /** The last refusal of Stop server, Cancel or Run anyway, shown until the next try. */
  actionError: string | null
  /** Loads the view and follows main's changes; returns the stop. */
  follow: () => () => void
  stopServer: () => Promise<void>
  cancel: (id: string) => Promise<void>
  runAnyway: (id: string) => Promise<void>
}

export const useModel3dStore = create<Model3dState>((set) => {
  const act = async (action: () => Promise<Model3dActionResult>): Promise<void> => {
    set({ actionError: null })
    const result = await action()
    if (!result.ok) set({ actionError: result.error })
  }
  return {
    view: null,
    actionError: null,
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
    stopServer: () => act(() => window.api.model3d.stopServer()),
    cancel: (id) => act(() => window.api.model3d.cancel(id)),
    runAnyway: (id) => act(() => window.api.model3d.runAnyway(id))
  }
})
