import { create } from 'zustand'
import type { ContextReport } from '../../shared/context'

/** A file open in Context's editor. */
export interface ContextEditorFile {
  path: string
  label: string
  sharedWithDefault: boolean
  /** Why it opens read-only; null when it can be saved. */
  readOnly: string | null
  /** A creatable file the report marked missing: it is written on first save. */
  creating: boolean
  /** Null while it is read. */
  content: string | null
  /** What is on disk, to tell unsaved edits apart. */
  saved: string | null
  /** The last read or save that failed, e.g. a JSON parse error. */
  error: string | null
}

export type ContextFileTarget = Pick<ContextEditorFile, 'path' | 'label' | 'sharedWithDefault' | 'readOnly' | 'creating'>

interface ContextState {
  selectedId: string | null
  /** The selected workspace's report; null until it is read. */
  report: ContextReport | null
  /** Start totals by workspace id; null where the folder is gone. */
  totals: Record<string, number | null>
  editor: ContextEditorFile | null
  /** Picks the workspace, then reads everything again; stays put when unsaved edits are kept. */
  select: (workspaceId: string | null) => void
  /** Reads the selected workspace's report, every start total and the open file (if unedited) again. */
  refresh: () => void
  /** Opens a file in the editor, after asking about unsaved edits to another one. */
  open: (target: ContextFileTarget) => void
  edit: (content: string) => void
  /** Saves through the guarded write, then reads the layers again. */
  save: () => Promise<void>
  /** True when nothing unsaved would be lost, or the user chose to discard it (the file then closes). */
  confirmLeave: () => boolean
}

export const isDirty = (file: ContextEditorFile | null): boolean => file !== null && file.content !== null && file.content !== file.saved

export const useContextStore = create<ContextState>((set, get) => {
  const readOpenFile = (workspaceId: string, path: string): void => {
    window.api.context.readFile(workspaceId, path).then(
      (result) => {
        const { editor, selectedId } = get()
        if (!editor || editor.path !== path || selectedId !== workspaceId || isDirty(editor)) return
        set({ editor: result.ok ? { ...editor, content: result.content, saved: result.content, error: null } : { ...editor, content: null, saved: null, error: result.error } })
      },
      (err) => console.error('[context] could not read the file', err)
    )
  }

  return {
    selectedId: null,
    report: null,
    totals: {},
    editor: null,
    select: (workspaceId) => {
      if (workspaceId !== get().selectedId) {
        if (!get().confirmLeave()) return
        set({ selectedId: workspaceId, report: null, editor: null })
      }
      get().refresh()
    },
    refresh: () => {
      const { selectedId, editor } = get()
      if (selectedId) {
        window.api.context.report(selectedId).then(
          (report) => {
            if (get().selectedId === selectedId) set({ report })
          },
          (err) => console.error('[context] could not read the report', err)
        )
        if (editor && !editor.creating && !isDirty(editor)) readOpenFile(selectedId, editor.path)
      }
      window.api.context.startTotals().then(
        (totals) => set({ totals }),
        (err) => console.error('[context] could not read the start totals', err)
      )
    },
    open: (target) => {
      const { selectedId, editor } = get()
      if (!selectedId || editor?.path === target.path || !get().confirmLeave()) return
      set({ editor: { ...target, content: target.creating ? '' : null, saved: target.creating ? '' : null, error: null } })
      if (!target.creating) readOpenFile(selectedId, target.path)
    },
    edit: (content) => {
      const { editor } = get()
      if (editor && !editor.readOnly) set({ editor: { ...editor, content } })
    },
    save: async () => {
      const { selectedId, editor } = get()
      if (!selectedId || !editor || editor.readOnly || editor.content === null) return
      const content = editor.content
      const result = await window.api.context.writeFile(selectedId, editor.path, content)
      const now = get().editor
      if (!now || now.path !== editor.path) return
      set({ editor: result.ok ? { ...now, saved: content, creating: false, error: null } : { ...now, error: `Not saved. ${result.error}` } })
      if (result.ok) get().refresh()
    },
    confirmLeave: () => {
      const { editor } = get()
      if (!isDirty(editor)) return true
      if (!window.confirm(`Discard unsaved edits to ${editor?.label}?`)) return false
      set({ editor: null })
      return true
    }
  }
})
