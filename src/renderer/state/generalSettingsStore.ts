import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface GeneralSettingsState {
  /** The extension's `claudeCode.allowDangerouslySkipPermissions`; applies to sessions started from then on. */
  allowDangerouslySkipPermissions: boolean
  setAllowDangerouslySkipPermissions: (allow: boolean) => void
  /** The extension's `claudeCode.useCtrlEnterToSend`: Ctrl+Enter sends and Enter adds a line. */
  useCtrlEnterToSend: boolean
  setUseCtrlEnterToSend: (on: boolean) => void
}

export const useGeneralSettingsStore = create<GeneralSettingsState>()(
  persist(
    (set) => ({
      allowDangerouslySkipPermissions: false,
      setAllowDangerouslySkipPermissions: (allow) => set({ allowDangerouslySkipPermissions: allow }),
      useCtrlEnterToSend: false,
      setUseCtrlEnterToSend: (on) => set({ useCtrlEnterToSend: on })
    }),
    { name: 'command-center.general-settings', storage: createJSONStorage(() => localStorage) }
  )
)
