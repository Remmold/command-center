import { create } from 'zustand'
import { ZOOM_DEFAULT_LEVEL, type ZoomStep } from '../../shared/zoom'

interface ZoomState {
  level: number
  init: () => void
  step: (step: ZoomStep) => void
}

let started = false

export const useZoomStore = create<ZoomState>((set) => ({
  level: ZOOM_DEFAULT_LEVEL,
  init: () => {
    if (started) return
    started = true
    window.api.zoom
      .get()
      .then((level) => set({ level }))
      .catch((err) => console.error('could not read the zoom level', err))
    window.api.zoom.onChanged((level) => set({ level }))
  },
  step: (step) => {
    window.api.zoom
      .step(step)
      .then((level) => set({ level }))
      .catch((err) => console.error('could not change the zoom level', err))
  }
}))
