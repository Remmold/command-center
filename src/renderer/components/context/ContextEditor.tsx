import { useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { splitFrontmatter } from '../../../shared/context'
import { defineMonacoTheme, MONACO_THEME } from '../../theme/theme'
import { isDirty, useContextStore, type ContextEditorFile } from '../../state/contextStore'
import { FileOpenerProvider } from '../chat/fileOpener'
import { editorOptions } from '../files/editorOptions'
import { detectLanguage } from '../files/fileTreeUtil'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { Markdown } from '../ui/Markdown'
import { NoticeLine } from '../ui/NoticeLine'
import { Pane } from '../ui/Pane'
import { PropertyList } from '../ui/PropertyList'
import { ScrollStack } from '../ui/ScrollStack'
import { Toolbar } from '../ui/Toolbar'

const isMarkdown = (path: string): boolean => /\.md$/i.test(path)

/**
 * Context's right pane: the open file for reading, rendered when it is markdown, until Edit opens the text editor.
 * Saves go through the guarded write. Hook scripts open as text and never run.
 */
export function ContextEditor({ defaultName, workspacePath }: { defaultName: string; workspacePath: string }) {
  const file = useContextStore((s) => s.editor)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const store = useContextStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void store.save()
        return
      }
      // Monaco claims Escape first to close its find box or suggestions; only an unclaimed one cancels.
      if (e.key !== 'Escape' || e.defaultPrevented || store.editor?.mode !== 'edit') return
      e.preventDefault()
      store.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!file) return <EmptyState>Click an item to open it.</EmptyState>
  return (
    <Pane label="Context editor">
      <Toolbar compact actions={<FileActions file={file} />}>
        <HeaderRow title={file.label} note={file.path}>
          {isDirty(file) && <span className="text-accent" aria-label="unsaved edits">●</span>}
          {file.creating && <Badge>new: written on first save</Badge>}
          {file.sharedWithDefault && <Badge>shared with {defaultName}</Badge>}
        </HeaderRow>
      </Toolbar>
      {file.readOnly && <NoticeLine strip>Read-only. {file.readOnly}</NoticeLine>}
      {file.error && (
        <NoticeLine strip tone="warning">
          {file.error}
        </NoticeLine>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <FileBody file={file} workspacePath={workspacePath} />
      </div>
    </Pane>
  )
}

function FileActions({ file }: { file: ContextEditorFile }) {
  if (file.readOnly || file.content === null) return null
  const store = useContextStore.getState()
  if (file.mode === 'preview') {
    return (
      <Button variant="secondary" onClick={store.startEdit}>
        Edit
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" onClick={store.cancel} tooltip="Back to the preview (Esc)">
        Cancel
      </Button>
      <Button onClick={() => void store.save()} tooltip="Save (Ctrl+S)">
        Save
      </Button>
    </div>
  )
}

function FileBody({ file, workspacePath }: { file: ContextEditorFile; workspacePath: string }) {
  if (file.content === null) return <EmptyState>{file.error ? 'Could not read the file.' : 'Reading…'}</EmptyState>
  if (file.mode === 'preview' && isMarkdown(file.path)) return <MarkdownPreview text={file.content} workspacePath={workspacePath} />
  return (
    <Editor
      key={file.path}
      height="100%"
      language={detectLanguage(file.path)}
      value={file.content}
      onChange={(v) => useContextStore.getState().edit(v ?? '')}
      beforeMount={defineMonacoTheme}
      theme={MONACO_THEME}
      options={editorOptions(file.readOnly !== null || file.mode !== 'edit')}
    />
  )
}

function MarkdownPreview({ text, workspacePath }: { text: string; workspacePath: string }) {
  const { meta, body } = splitFrontmatter(text)
  const entries = Object.entries(meta)
  if (entries.length === 0 && body.trim() === '') return <EmptyState>Empty file.</EmptyState>
  return (
    <FileOpenerProvider cwd={workspacePath}>
      <ScrollStack padded>
        {entries.length > 0 && (
          <Card>
            <PropertyList label="Frontmatter" entries={entries} />
          </Card>
        )}
        <Markdown text={body} />
      </ScrollStack>
    </FileOpenerProvider>
  )
}
