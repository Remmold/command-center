import { create } from 'zustand'
import { DEFAULT_PROFILE_ID } from '../../shared/types'
import type { ClaudeSettingsRead, SettingsLayerFile } from '../../shared/claudeSettings'
import { patchSize } from '../../shared/claudeSettings'
import { stage, type PendingFile } from './claudeSettingsPending'
import { useModelStore } from './modelStore'

interface ClaudeSettingsState {
  profileId: string
  read: ClaudeSettingsRead | null
  readError: string | null
  /** By file path, so another account's changes wait while it is not on screen. */
  pending: Record<string, PendingFile>
  saving: boolean
  saveError: string | null
  load: () => Promise<void>
  selectProfile: (profileId: string) => void
  stage: (key: string, value: unknown) => void
  discard: () => void
  save: () => Promise<void>
  /** Total waiting changes across every file. */
  pendingCount: () => number
  /** Asks before unsaved changes are dropped; false to stay. */
  confirmLeave: () => boolean
}

const target = (read: ClaudeSettingsRead | null): SettingsLayerFile | null => read?.account ?? null

export const useClaudeSettingsStore = create<ClaudeSettingsState>((set, get) => {
  let turn = 0
  return {
    profileId: DEFAULT_PROFILE_ID,
    read: null,
    readError: null,
    pending: {},
    saving: false,
    saveError: null,
    load: async () => {
      const mine = ++turn
      try {
        const read = await window.api.claudeSettings.read(get().profileId, null)
        if (mine === turn) set({ read, readError: null })
      } catch (err) {
        if (mine === turn) set({ readError: (err as Error).message })
      }
    },
    selectProfile: (profileId) => {
      if (profileId === get().profileId) return
      set({ profileId, read: null, saveError: null })
      void get().load()
    },
    stage: (key, value) => {
      const file = target(get().read)
      if (!file?.snapshot.value) return
      const { [file.path]: current, ...rest } = get().pending
      const next = stage(current ?? null, file.snapshot.value, key, value)
      set({ pending: next ? { ...rest, [file.path]: next } : rest, saveError: null })
    },
    discard: () => {
      const file = target(get().read)
      if (!file) return
      const { [file.path]: _dropped, ...rest } = get().pending
      set({ pending: rest, saveError: null })
      void get().load()
    },
    save: async () => {
      const file = target(get().read)
      const changes = file ? get().pending[file.path] : undefined
      if (!file || !changes || get().saving) return
      set({ saving: true, saveError: null })
      try {
        const result = await window.api.claudeSettings.save(file.path, changes.base, changes.patch)
        if (result.ok) {
          const { [file.path]: _saved, ...rest } = get().pending
          const read = get().read
          set({ pending: rest, read: read && read.account.path === file.path ? { ...read, account: { ...read.account, snapshot: result.snapshot } } : read })
          void useModelStore.getState().reloadDefaults()
        } else if ('conflicts' in result) {
          set({ saveError: `Not saved: Claude changed ${result.conflicts.join(', ')} since this page read the file. Discard to see its values.` })
        } else {
          set({ saveError: `Not saved: ${result.error}` })
        }
      } catch (err) {
        set({ saveError: `Not saved: ${(err as Error).message}` })
      } finally {
        set({ saving: false })
      }
    },
    pendingCount: () => Object.values(get().pending).reduce((sum, file) => sum + patchSize(file.patch), 0),
    confirmLeave: () => {
      const count = get().pendingCount()
      if (count === 0) return true
      if (!window.confirm(`Discard ${count} unsaved Claude Code ${count === 1 ? 'change' : 'changes'}?`)) return false
      set({ pending: {}, saveError: null })
      return true
    }
  }
})
