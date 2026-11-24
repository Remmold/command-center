import { useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { defineMonacoTheme, MONACO_THEME } from '../../theme/theme'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import type { ProjectView } from '../../state/projectViewsStore'
import { useViewStore } from '../../state/viewStore'
import { editorOptions } from './editorOptions'
import { basename, detectLanguage } from './fileTreeUtil'

interface Props {
  view: ProjectView
}

export function EditorPane({ view }: Props) {
  const closeFile = useProjectViewsStore((s) => s.closeFile)
  const setActiveFile = useProjectViewsStore((s) => s.setActiveFile)
  const updateFileContent = useProjectViewsStore((s) => s.updateFileContent)
  const markFileSaved = useProjectViewsStore((s) => s.markFileSaved)

  const activeFile = view.openFiles.find((f) => f.path === view.activeFilePath) ?? null

  // Save on Ctrl/Cmd+S
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (!activeFile || activeFile.binary) return
        // Only consume if the active project view is "this" project
        const state = useProjectViewsStore.getState()
        if (state.activeProjectId !== view.projectId || useViewStore.getState().view !== 'work') return
        e.preventDefault()
        const result = await window.api.files.write(
          view.projectPath,
          activeFile.path,
          activeFile.content
        )
        if (result.ok) {
          markFileSaved(view.projectId, activeFile.path)
        } else {
          alert(`save failed: ${result.error ?? 'unknown error'}`)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFile, view.projectId, view.projectPath, markFileSaved])

  return (
    <section className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex shrink-0 items-center overflow-x-auto border-b border-subtle bg-sidebar">
        {view.openFiles.length === 0 && (
          <span className="px-3 py-1.5 text-xs text-muted">no files open</span>
        )}
        {view.openFiles.map((file) => {
          const active = file.path === view.activeFilePath
          return (
            <div
              key={file.path}
              className={
                'group flex items-center gap-1 border-r border-subtle px-3 py-1.5 text-xs ' +
                (active ? 'bg-editor text-fg' : 'text-muted hover:bg-list-hover')
              }
            >
              <button
                onClick={() => setActiveFile(view.projectId, file.path)}
                className="truncate"
                title={file.path}
              >
                {basename(file.path)}
                {file.dirty && <span className="text-amber-400"> •</span>}
              </button>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  closeFile(view.projectId, file.path)
                }}
                className="rounded px-1 text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
                role="button"
                aria-label={`close ${file.path}`}
              >
                ✕
              </span>
            </div>
          )
        })}
      </div>
      <div className="min-h-0 flex-1">
        {!activeFile && (
          <div className="flex h-full items-center justify-center text-sm text-faint">
            click a file to open
          </div>
        )}
        {activeFile && activeFile.binary && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            binary file — preview not supported
          </div>
        )}
        {activeFile && !activeFile.binary && (
          <Editor
            key={activeFile.path}
            height="100%"
            language={detectLanguage(activeFile.path)}
            value={activeFile.content}
            onChange={(v) =>
              updateFileContent(view.projectId, activeFile.path, v ?? '')
            }
            beforeMount={defineMonacoTheme}
            theme={MONACO_THEME}
            options={editorOptions()}
          />
        )}
      </div>
    </section>
  )
}
