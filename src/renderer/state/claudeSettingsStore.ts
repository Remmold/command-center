import { create } from 'zustand'
import { DEFAULT_PROFILE_ID, type Workspace } from '../../shared/types'
import { changeCount, patchSize, saveFailure, type ClaudeSettingsRead, type SettingsLayer, type SettingsLayerFile } from '../../shared/claudeSettings'
import { stage, type PendingFile } from './claudeSettingsPending'
import { useModelStore } from './modelStore'
import { useProjectViewsStore } from './projectViewsStore'
import { useWorkspacesStore } from './workspacesStore'

interface ClaudeSettingsState {
  layer: SettingsLayer
  /** The account the Account layer edits. */
  profileId: string
  /** The workspace the Repo and Local layers edit; its own account gives their account layer. */
  workspaceId: string | null
  read: ClaudeSettingsRead | null
  readError: string | null
  /** By file path, so another account's changes wait while it is not on screen. */
  pending: Record<string, PendingFile>
  saving: boolean
  saveError: string | null
  load: () => Promise<void>
  selectLayer: (layer: SettingsLayer) => void
  selectProfile: (profileId: string) => void
  selectWorkspace: (workspaceId: string) => void
  stage: (key: string, value: unknown) => void
  discard: () => void
  save: () => Promise<void>
  /** Total waiting changes across every file. */
  pendingCount: () => number
  /** Asks before unsaved changes would be dropped; false to stay. */
  confirmLeave: () => boolean
  /** Drops every waiting change, once the section is left. */
  dropAll: () => void
}

/** The layer file the form edits. */
const editedFile = (read: ClaudeSettingsRead | null, layer: SettingsLayer): SettingsLayerFile | null => read?.[layer] ?? null

/** The workspace open in Work, else the first. */
function startWorkspace(): string | null {
  const { workspaces } = useWorkspacesStore.getState()
  const open = useProjectViewsStore.getState().activeProjectId
  return workspaces.find((w) => w.id === open)?.id ?? workspaces[0]?.id ?? null
}

/**
 * The workspace whose layers make the effective value: the chosen one, or on the Account layer
 * the chosen one when it is on that account, else the first workspace that is.
 */
export function shownWorkspace(
  { layer, profileId, workspaceId }: Pick<ClaudeSettingsState, 'layer' | 'profileId' | 'workspaceId'>,
  workspaces: readonly Workspace[]
): Workspace | undefined {
  const chosen = workspaces.find((w) => w.id === workspaceId)
  if (layer !== 'account') return chosen
  return chosen?.profileId === profileId ? chosen : workspaces.find((w) => w.profileId === profileId)
}

export const useClaudeSettingsStore = create<ClaudeSettingsState>((set, get) => {
  let readTurn = 0
  return {
    layer: 'account',
    profileId: DEFAULT_PROFILE_ID,
    workspaceId: null,
    read: null,
    readError: null,
    pending: {},
    saving: false,
    saveError: null,
    load: async () => {
      const thisRead = ++readTurn
      const workspace = shownWorkspace(get(), useWorkspacesStore.getState().workspaces)
      try {
        const read = await window.api.claudeSettings.read(workspace?.profileId ?? get().profileId, workspace?.id ?? null)
        if (thisRead === readTurn) set({ read, readError: null })
      } catch (err) {
        if (thisRead === readTurn) set({ readError: (err as Error).message })
      }
    },
    selectLayer: (layer) => {
      if (layer === get().layer) return
      set({ layer, workspaceId: get().workspaceId ?? startWorkspace(), read: null, saveError: null })
      void get().load()
    },
    selectWorkspace: (workspaceId) => {
      if (workspaceId === get().workspaceId) return
      set({ workspaceId, read: null, saveError: null })
      void get().load()
    },
    selectProfile: (profileId) => {
      if (profileId === get().profileId) return
      set({ profileId, read: null, saveError: null })
      void get().load()
    },
    stage: (key, value) => {
      const file = editedFile(get().read, get().layer)
      if (!file?.snapshot.value) return
      const { [file.path]: current, ...rest } = get().pending
      const next = stage(current ?? null, file.snapshot.value, key, value)
      set({ pending: next ? { ...rest, [file.path]: next } : rest, saveError: null })
    },
    discard: () => {
      const file = editedFile(get().read, get().layer)
      if (!file) return
      const { [file.path]: _dropped, ...rest } = get().pending
      set({ pending: rest, saveError: null })
      void get().load()
    },
    save: async () => {
      const file = editedFile(get().read, get().layer)
      const changes = file ? get().pending[file.path] : undefined
      if (!file || !changes || get().saving) return
      set({ saving: true, saveError: null })
      try {
        const result = await window.api.claudeSettings.save(file.path, changes.base, changes.patch)
        if (result.ok) {
          const { [file.path]: _saved, ...rest } = get().pending
          const read = get().read
          const shown = read?.[file.layer]
          set({ pending: rest, read: read && shown?.path === file.path ? { ...read, [file.layer]: { ...shown, snapshot: result.snapshot } } : read })
          void useModelStore.getState().reloadDefaults()
        } else {
          set({ saveError: `Not saved: ${saveFailure(result)}.${'conflicts' in result ? ' Discard to see its values.' : ''}` })
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
      return count === 0 || window.confirm(`Discard ${changeCount(count)} to Claude Code settings?`)
    },
    dropAll: () => set({ pending: {}, saveError: null })
  }
})
