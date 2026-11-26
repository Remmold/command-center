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
  /** The Key bindings editor is on screen, so the form edits the account's keybindings.json. Account layer only. */
  keybindings: boolean
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
  showKeybindings: (shown: boolean) => void
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

/** A file of the read the form can edit. */
export type FileSlot = SettingsLayer | 'keybindings'

export const editedSlot = ({ layer, keybindings }: Pick<ClaudeSettingsState, 'layer' | 'keybindings'>): FileSlot => (keybindings && layer === 'account' ? 'keybindings' : layer)

/** The file the form edits. */
const editedFile = (state: Pick<ClaudeSettingsState, 'read' | 'layer' | 'keybindings'>): SettingsLayerFile | null => state.read?.[editedSlot(state)] ?? null

const SLOTS = ['account', 'keybindings', 'repo', 'local'] as const

const slotOf = (read: ClaudeSettingsRead, path: string): FileSlot | undefined => SLOTS.find((slot) => read[slot]?.path.toLowerCase() === path.toLowerCase())

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
    keybindings: false,
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
        if (thisRead === readTurn) set({ read, readError: null, pending: pendingOnto(get().pending, SLOTS.map((slot) => read[slot])) })
      } catch (err) {
        if (thisRead === readTurn) set({ readError: (err as Error).message })
      }
    },
    applyChange: ({ path, snapshot }) => {
      const read = get().read
      if (!read) return
      const slot = slotOf(read, path)
      const shown = slot && read[slot]
      if (!slot || !shown) {
        void get().load()
        return
      }
      const file = { ...shown, snapshot }
      set({ read: { ...read, [slot]: file }, pending: pendingOnto(get().pending, [file]) })
    },
    selectLayer: (layer) => {
      if (layer === get().layer) return
      set({ layer, keybindings: get().keybindings && layer === 'account', workspaceId: get().workspaceId ?? startWorkspace(), read: null, saveError: null, settling: false })
      void get().load()
    },
    selectWorkspace: (workspaceId) => {
      if (workspaceId === get().workspaceId) return
      set({ workspaceId, read: null, saveError: null, settling: false })
      void get().load()
    },
    showKeybindings: (shown) => {
      const keybindings = shown && get().layer === 'account'
      if (keybindings !== get().keybindings) set({ keybindings, saveError: null, settling: false })
    },
    selectProfile: (profileId) => {
      if (profileId === get().profileId) return
      set({ profileId, read: null, saveError: null, settling: false })
      void get().load()
    },
    stage: (key, value) => {
      const file = editedFile(get())
      if (!file?.snapshot.value) return
      const { [file.path]: current, ...rest } = get().pending
      const next = stage(current ?? null, file.snapshot.value, key, value)
      set({ pending: next ? { ...rest, [file.path]: next } : rest, saveError: null })
    },
    markUnparsed: (key, unparsed) => {
      const marked = get().unparsed.includes(key)
      if (unparsed && !marked) set({ unparsed: [...get().unparsed, key] })
      else if (!unparsed && marked) set({ unparsed: get().unparsed.filter((k) => k !== key) })
    },
    discard: () => {
      const file = editedFile(get())
      if (!file) return
      const { [file.path]: _dropped, ...rest } = get().pending
      set({ pending: rest, saveError: null, settling: false, discards: get().discards + 1 })
      void get().load()
    },
    save: async () => {
      const file = editedFile(get())
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
          const slot = read && slotOf(read, file.path)
          const shown = slot && read[slot]
          set({ pending: rest, read: slot && shown ? { ...read, [slot]: { ...shown, snapshot: result.snapshot } } : read })
          void useModelStore.getState().reloadDefaults()
        } else if ('conflicts' in result) {
          // The watch had not seen the change yet: read the file, then ask.
          await get().load()
          const now = editedFile(get())
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
      const file = editedFile(get())
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
      const boxes = get().unparsed.length
      if (count === 0 && boxes === 0) return true
      const lost = [count > 0 && changeCount(count), boxes > 0 && `JSON typed in ${boxes === 1 ? 'a box' : `${boxes} boxes`}`].filter(Boolean).join(' and ')
      return window.confirm(`Discard ${lost} to Claude Code settings?`)
    },
    dropAll: () => set({ pending: {}, saveError: null, settling: false })
  }
})
