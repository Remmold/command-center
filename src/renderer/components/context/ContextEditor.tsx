import { useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { defineMonacoTheme, MONACO_THEME } from '../../theme/theme'
import { isDirty, useContextStore } from '../../state/contextStore'
import { editorOptions } from '../files/editorOptions'
import { detectLanguage } from '../files/fileTreeUtil'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { NoticeLine } from '../ui/NoticeLine'
import { Pane } from '../ui/Pane'

/** Context's right pane: the open file, saved with Ctrl+S through the guarded write. Hook scripts open as text and never run. */
export function ContextEditor({ defaultName }: { defaultName: string }) {
  const file = useContextStore((s) => s.editor)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return
      e.preventDefault()
      void useContextStore.getState().save()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!file) return <EmptyState>Click an item to open it.</EmptyState>
  return (
    <Pane label="Context editor">
      <div className="flex h-8 shrink-0 items-center border-b border-subtle px-2">
        <HeaderRow title={file.label} note={file.path}>
          {isDirty(file) && <span className="text-accent" aria-label="unsaved edits">●</span>}
          {file.creating && <Badge>new: written on first save</Badge>}
          {file.sharedWithDefault && <Badge>shared with {defaultName}</Badge>}
        </HeaderRow>
      </div>
      {file.readOnly && <NoticeLine strip>Read-only. {file.readOnly}</NoticeLine>}
      {file.error && (
        <NoticeLine strip tone="warning">
          {file.error}
        </NoticeLine>
      )}
      <div className="min-h-0 flex-1">
        {file.content === null ? (
          <EmptyState>{file.error ? 'Could not read the file.' : 'Reading…'}</EmptyState>
        ) : (
          <Editor
            key={file.path}
            height="100%"
            language={detectLanguage(file.path)}
            value={file.content}
            onChange={(v) => useContextStore.getState().edit(v ?? '')}
            beforeMount={defineMonacoTheme}
            theme={MONACO_THEME}
            options={editorOptions(file.readOnly !== null)}
          />
        )}
      </div>
    </Pane>
  )
}
