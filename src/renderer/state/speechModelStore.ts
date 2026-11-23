import { create } from 'zustand'
import type { SpeechModelStatus } from '../../shared/video'

interface SpeechModelState {
  /** Null until the main process has answered. */
  status: SpeechModelStatus | null
  download: () => void
  cancel: () => void
  remove: () => void
}

export const useSpeechModelStore = create<SpeechModelState>()((set) => ({
  status: null,
  download: () => void window.api.video.downloadModel().then((status) => set({ status })),
  cancel: () => void window.api.video.cancelModelDownload(),
  remove: () => void window.api.video.removeModel().then((status) => set({ status }))
}))

if (typeof window !== 'undefined' && window.api?.video) {
  window.api.video.onModelChanged((status) => useSpeechModelStore.setState({ status }))
  void window.api.video.modelStatus().then((status) => useSpeechModelStore.setState({ status }))
}
