import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { VideoTranscription } from '../../shared/video'

interface GeneralSettingsState {
  /** The extension's `claudeCode.allowDangerouslySkipPermissions`; applies to sessions started from then on. */
  allowDangerouslySkipPermissions: boolean
  setAllowDangerouslySkipPermissions: (allow: boolean) => void
  /** The extension's `claudeCode.useCtrlEnterToSend`: Ctrl+Enter sends and Enter adds a line. */
  useCtrlEnterToSend: boolean
  setUseCtrlEnterToSend: (on: boolean) => void
  /** The extension's `claudeCode.promptSuggestions`; applies to chats started from then on. */
  promptSuggestions: boolean
  setPromptSuggestions: (on: boolean) => void
  /** Whether a video's speech is transcribed; asked on the first video with sound. */
  videoTranscription: VideoTranscription
  setVideoTranscription: (value: VideoTranscription) => void
}

export const useGeneralSettingsStore = create<GeneralSettingsState>()(
  persist(
    (set) => ({
      allowDangerouslySkipPermissions: false,
      setAllowDangerouslySkipPermissions: (allow) => set({ allowDangerouslySkipPermissions: allow }),
      useCtrlEnterToSend: false,
      setUseCtrlEnterToSend: (on) => set({ useCtrlEnterToSend: on }),
      promptSuggestions: true,
      setPromptSuggestions: (on) => set({ promptSuggestions: on }),
      videoTranscription: 'ask',
      setVideoTranscription: (value) => set({ videoTranscription: value })
    }),
    { name: 'command-center.general-settings', storage: createJSONStorage(() => localStorage) }
  )
)
