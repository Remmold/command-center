import { create } from 'zustand'
import type { Model3dActionResult, Model3dModel, Model3dOpenResult, Model3dView } from '../../shared/model3d'
import { useViewStore } from './viewStore'

interface Model3dState {
  /** Null until main has answered once. */
  view: Model3dView | null
  /** The last refusal of Stop server, Cancel or Run anyway, shown until the next try. */
  actionError: string | null
  /** The model in the viewer; it stays open while the app shows another view. */
  model: Model3dModel | null
  /** Why the last model could not be opened, shown until the next try. */
  openError: string | null
  /** Loads the view and follows main's changes; returns the stop. */
  follow: () => () => void
  stopServer: () => Promise<void>
  cancel: (id: string) => Promise<void>
  runAnyway: (id: string) => Promise<void>
  openModel: (path: string) => Promise<void>
  /** Open model…: the native picker; cancelling it keeps the open model. */
  pickModel: () => Promise<void>
}

export const useModel3dStore = create<Model3dState>((set) => {
  const act = async (action: () => Promise<Model3dActionResult>): Promise<void> => {
    set({ actionError: null })
    const result = await action()
    if (!result.ok) set({ actionError: result.error })
  }
  let opening = 0
  const show = async (open: () => Promise<Model3dOpenResult | null>): Promise<void> => {
    const turn = ++opening
    set({ openError: null })
    const result = await open()
    // Two clicks in a row: the model clicked last wins, however the answers arrive.
    if (!result || turn !== opening) return
    set(result.ok ? { model: result.model } : { openError: result.error })
  }
  return {
    view: null,
    actionError: null,
    model: null,
    openError: null,
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
    runAnyway: (id) => act(() => window.api.model3d.runAnyway(id)),
    openModel: (path) => show(() => window.api.model3d.openModel(path)),
    pickModel: () => show(() => window.api.model3d.pickModel())
  }
})

/** Shows the 3D view with the model at `path`, as a chat's Media tile does. */
export function openModelInView(path: string): void {
  useViewStore.getState().setView('3d')
  void useModel3dStore.getState().openModel(path)
}
