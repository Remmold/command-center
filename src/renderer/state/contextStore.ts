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
  mode: 'preview' | 'edit'
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
  startEdit: () => void
  edit: (content: string) => void
  /** Saves through the guarded write and returns to the preview, then reads the layers again. */
  save: () => Promise<void>
  /** Back to the preview with the saved text, after asking about unsaved edits. */
  cancel: () => void
  /** True when nothing unsaved would be lost, or the user chose to discard it (the file then closes). */
  confirmLeave: () => boolean
}

export const isDirty = (file: ContextEditorFile | null): boolean => file !== null && file.content !== null && file.content !== file.saved

const confirmDiscard = (file: ContextEditorFile | null): boolean => !isDirty(file) || window.confirm(`Discard unsaved edits to ${file?.label}?`)

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
      set({ editor: { ...target, content: target.creating ? '' : null, saved: target.creating ? '' : null, error: null, mode: target.creating ? 'edit' : 'preview' } })
      if (!target.creating) readOpenFile(selectedId, target.path)
    },
    startEdit: () => {
      const { editor } = get()
      if (editor && !editor.readOnly && editor.content !== null) set({ editor: { ...editor, mode: 'edit' } })
    },
    edit: (content) => {
      const { editor } = get()
      if (editor?.mode === 'edit' && !editor.readOnly) set({ editor: { ...editor, content } })
    },
    save: async () => {
      const { selectedId, editor } = get()
      if (!selectedId || !editor || editor.mode !== 'edit' || editor.readOnly || editor.content === null) return
      const content = editor.content
      const result = await window.api.context.writeFile(selectedId, editor.path, content)
      const now = get().editor
      if (!now || now.path !== editor.path) return
      if (!result.ok) {
        set({ editor: { ...now, error: `Not saved. ${result.error}` } })
        return
      }
      const written = { ...now, saved: content, creating: false, error: null }
      // Cancelled mid-write: the disk has the new text now, so the preview shows it. Text typed mid-write stays in the editor, unsaved.
      if (now.mode !== 'edit') set({ editor: { ...written, content } })
      else set({ editor: { ...written, mode: now.content === content ? 'preview' : 'edit' } })
      get().refresh()
    },
    cancel: () => {
      const { editor } = get()
      if (editor?.mode !== 'edit' || !confirmDiscard(editor)) return
      set({ editor: { ...editor, content: editor.saved, error: null, mode: 'preview' } })
    },
    confirmLeave: () => {
      const { editor } = get()
      if (!isDirty(editor)) {
        if (editor?.mode === 'edit' && !editor.creating) set({ editor: { ...editor, mode: 'preview' } })
        return true
      }
      if (!confirmDiscard(editor)) return false
      set({ editor: null })
      return true
    }
  }
})
