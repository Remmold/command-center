import { useEffect } from 'react'
import { create } from 'zustand'

interface TestFlowState {
  /** The test-flows folder, null until main answered. */
  folder: string | null
  load: () => Promise<void>
  /** Resolves to the folder in force afterwards. */
  setFolder: (folder: string) => Promise<string | null>
}

let loading: Promise<void> | null = null

export const useTestFlowStore = create<TestFlowState>((set, get) => ({
  folder: null,
  load: async () => {
    if (loading) return loading
    loading = (async () => {
      try {
        set({ folder: await window.api.testFlow.folder() })
      } catch (err) {
        loading = null
        console.error('could not read the test-flows folder', err)
      }
    })()
    return loading
  },
  setFolder: async (folder) => {
    try {
      const saved = await window.api.testFlow.setFolder(folder)
      set({ folder: saved })
      return saved
    } catch (err) {
      console.error('could not save the test-flows folder', err)
      return get().folder
    }
  }
}))

/** The folder, asking main for it on first use. */
export function useTestFlowsFolder(): string | null {
  const folder = useTestFlowStore((s) => s.folder)
  const load = useTestFlowStore((s) => s.load)
  useEffect(() => {
    if (folder === null) void load()
  }, [folder, load])
  return folder
}
