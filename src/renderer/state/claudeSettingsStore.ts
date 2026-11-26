import { create } from 'zustand'
import { DEFAULT_PROFILE_ID, type Workspace } from '../../shared/types'
import { changeCount, patchSize, saveFailure, type ClaudeSettingsRead, type SettingsFileChange, type SettingsLayer, type SettingsLayerFile } from '../../shared/claudeSettings'
import { conflicts, refreshed, settle, stage, type ConflictChoice, type PendingFile } from './claudeSettingsPending'
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
  /** Save is asking which value to keep for the keys the file changed under. */
  settling: boolean
  /** The key paths of raw JSON boxes holding text not yet taken as their value; Save waits until there are none. */
  unparsed: string[]
  /** Counts Discards, so the form can drop text typed in its boxes. */
  discards: number
  load: () => Promise<void>
  /** A watched file changed on disk: its snapshot refreshes and its waiting changes stay. */
  applyChange: (change: SettingsFileChange) => void
  selectLayer: (layer: SettingsLayer) => void
  selectProfile: (profileId: string) => void
  selectWorkspace: (workspaceId: string) => void
  stage: (key: string, value: unknown) => void
  markUnparsed: (key: string, unparsed: boolean) => void
  discard: () => void
  /** Asks per conflicting key first; nothing is written while one is unsettled. */
  save: () => Promise<void>
  /** Keeps mine or the file's value per conflicting key, then saves against the file as it is now. */
  settleConflicts: (choices: Record<string, ConflictChoice>) => Promise<void>
  cancelSettling: () => void
  /** Total waiting changes across every file. */
  pendingCount: () => number
  /** Asks before unsaved changes would be dropped; false to stay. */
  confirmLeave: () => boolean
  /** Drops every waiting change, once the section is left. */
  dropAll: () => void
}

/** The layer file the form edits. */
const editedFile = (read: ClaudeSettingsRead | null, layer: SettingsLayer): SettingsLayerFile | null => read?.[layer] ?? null

const LAYER_KEYS = ['account', 'repo', 'local'] as const

/** The waiting changes of each layer file in the read, refreshed onto it as read. */
function pendingOnto(pending: Record<string, PendingFile>, files: readonly (SettingsLayerFile | null)[]): Record<string, PendingFile> {
  const next = { ...pending }
  for (const file of files) {
    const waiting = file && next[file.path]
    if (waiting && file.snapshot.value) next[file.path] = refreshed(waiting, file.snapshot.value)
  }
  return next
}

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
    settling: false,
    unparsed: [],
    discards: 0,
    load: async () => {
      const thisRead = ++readTurn
      const workspace = shownWorkspace(get(), useWorkspacesStore.getState().workspaces)
      try {
        const read = await window.api.claudeSettings.read(workspace?.profileId ?? get().profileId, workspace?.id ?? null)
        if (thisRead === readTurn) set({ read, readError: null, pending: pendingOnto(get().pending, LAYER_KEYS.map((layer) => read[layer])) })
      } catch (err) {
        if (thisRead === readTurn) set({ readError: (err as Error).message })
      }
    },
    applyChange: ({ path, snapshot }) => {
      const read = get().read
      if (!read) return
      const layer = LAYER_KEYS.find((key) => read[key]?.path.toLowerCase() === path.toLowerCase())
      const shown = layer && read[layer]
      if (!layer || !shown) {
        void get().load()
        return
      }
      const file = { ...shown, snapshot }
      set({ read: { ...read, [layer]: file }, pending: pendingOnto(get().pending, [file]) })
    },
    selectLayer: (layer) => {
      if (layer === get().layer) return
      set({ layer, workspaceId: get().workspaceId ?? startWorkspace(), read: null, saveError: null, settling: false })
      void get().load()
    },
    selectWorkspace: (workspaceId) => {
      if (workspaceId === get().workspaceId) return
      set({ workspaceId, read: null, saveError: null, settling: false })
      void get().load()
    },
    selectProfile: (profileId) => {
      if (profileId === get().profileId) return
      set({ profileId, read: null, saveError: null, settling: false })
      void get().load()
    },
    stage: (key, value) => {
      const file = editedFile(get().read, get().layer)
      if (!file?.snapshot.value) return
      const { [file.path]: current, ...rest } = get().pending
      const next = stage(current ?? null, file.snapshot.value, key, value)
      set({ pending: next ? { ...rest, [file.path]: next } : rest, saveError: null })
    },
    markUnparsed: (key, unparsed) => {
      const others = get().unparsed.filter((k) => k !== key)
      if (unparsed !== others.length < get().unparsed.length) set({ unparsed: unparsed ? [...others, key] : others })
    },
    discard: () => {
      const file = editedFile(get().read, get().layer)
      if (!file) return
      const { [file.path]: _dropped, ...rest } = get().pending
      set({ pending: rest, saveError: null, settling: false, discards: get().discards + 1 })
      void get().load()
    },
    save: async () => {
      const file = editedFile(get().read, get().layer)
      const changes = file ? get().pending[file.path] : undefined
      if (!file || !changes || get().saving || get().unparsed.length > 0) return
      if (conflicts(changes, file.snapshot.value).length > 0) {
        set({ settling: true, saveError: null })
        return
      }
      set({ saving: true, saveError: null })
      try {
        const result = await window.api.claudeSettings.save(file.path, changes.base, changes.patch)
        if (result.ok) {
          const { [file.path]: _saved, ...rest } = get().pending
          const read = get().read
          const shown = read?.[file.layer]
          set({ pending: rest, read: read && shown?.path === file.path ? { ...read, [file.layer]: { ...shown, snapshot: result.snapshot } } : read })
          void useModelStore.getState().reloadDefaults()
        } else if ('conflicts' in result) {
          // The watch had not seen the change yet: read the file, then ask.
          await get().load()
          const now = editedFile(get().read, get().layer)
          const waiting = now && get().pending[now.path]
          if (waiting && conflicts(waiting, now.snapshot.value).length > 0) set({ settling: true })
          else set({ saveError: `Not saved: ${saveFailure(result)}. Save again to retry.` })
        } else {
          set({ saveError: `Not saved: ${saveFailure(result)}.` })
        }
      } catch (err) {
        set({ saveError: `Not saved: ${(err as Error).message}` })
      } finally {
        set({ saving: false })
      }
    },
    settleConflicts: async (choices) => {
      const file = editedFile(get().read, get().layer)
      const changes = file ? get().pending[file.path] : undefined
      if (!file?.snapshot.value || !changes) return
      if (conflicts(changes, file.snapshot.value).some((c) => !(c.key in choices))) return
      const { [file.path]: _settled, ...rest } = get().pending
      const next = settle(changes, file.snapshot.value, choices)
      set({ pending: next ? { ...rest, [file.path]: next } : rest, settling: false })
      await get().save()
    },
    cancelSettling: () => set({ settling: false }),
    pendingCount: () => Object.values(get().pending).reduce((sum, file) => sum + patchSize(file.patch), 0),
    confirmLeave: () => {
      const count = get().pendingCount()
      return count === 0 || window.confirm(`Discard ${changeCount(count)} to Claude Code settings?`)
    },
    dropAll: () => set({ pending: {}, saveError: null, settling: false })
  }
})
