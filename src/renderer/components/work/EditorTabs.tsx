import { GitCompare, MessageCircle, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useProjectViewsStore, type ProjectView } from '../../state/projectViewsStore'
import { getFileIcon } from '../files/fileIcons'
import { basename } from '../files/fileTreeUtil'

const DIFF_KIND_LABEL: Record<string, string> = {
  staged: 'staged',
  unstaged: 'working',
  untracked: 'new'
}

function Tab({ active, children, onSelect, onClose, tooltip, closeLabel }: {
  active: boolean
  children: ReactNode
  onSelect: () => void
  onClose?: () => void
  tooltip: string
  closeLabel?: string
}) {
  return (
    <div
      className={
        'group flex shrink-0 items-center gap-1.5 border-r border-subtle px-3 py-1.5 text-xs ' +
        (active ? 'bg-editor text-fg' : 'text-muted hover:bg-list-hover hover:text-fg')
      }
    >
      <button onClick={onSelect} className="flex items-center gap-1.5 truncate" title={tooltip}>
        {children}
      </button>
      {onClose && (
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted opacity-0 hover:bg-list-hover hover:text-fg group-hover:opacity-100"
          aria-label={closeLabel}
        >
          <X size={11} strokeWidth={2.25} />
        </button>
      )}
    </div>
  )
}

/** The open workspace's chat, file and diff tabs, shown while its IDE panels are open. */
export function EditorTabs({ view }: { view: ProjectView }) {
  const setCenterView = useProjectViewsStore((s) => s.setCenterView)
  const setActiveFile = useProjectViewsStore((s) => s.setActiveFile)
  const closeFile = useProjectViewsStore((s) => s.closeFile)
  const setActiveDiff = useProjectViewsStore((s) => s.setActiveDiff)
  const closeDiff = useProjectViewsStore((s) => s.closeDiff)

  return (
    <div role="tablist" className="scrollbar-thin flex shrink-0 items-center overflow-x-auto border-b border-subtle bg-sidebar">
      <Tab active={view.centerView === 'chat'} onSelect={() => setCenterView(view.projectId, 'chat')} tooltip="session">
        <MessageCircle size={13} strokeWidth={2} className="text-muted" />
        session
      </Tab>
      {view.openFiles.map((file) => {
        const name = basename(file.path)
        const { icon: Icon, color } = getFileIcon(name)
        return (
          <Tab
            key={file.path}
            active={view.centerView === 'file' && view.activeFilePath === file.path}
            onSelect={() => {
              setActiveFile(view.projectId, file.path)
              setCenterView(view.projectId, 'file')
            }}
            onClose={() => closeFile(view.projectId, file.path)}
            closeLabel={`close ${file.path}`}
            tooltip={file.path}
          >
            <Icon size={13} strokeWidth={1.75} className={`shrink-0 ${color}`} />
            {name}
            {file.dirty && <span className="text-accent">●</span>}
          </Tab>
        )
      })}
      {view.openDiffs.map((diff) => (
        <Tab
          key={diff.id}
          active={view.centerView === 'diff' && view.activeDiffId === diff.id}
          onSelect={() => {
            setActiveDiff(view.projectId, diff.id)
            setCenterView(view.projectId, 'diff')
          }}
          onClose={() => closeDiff(view.projectId, diff.id)}
          closeLabel={`close diff for ${diff.path}`}
          tooltip={`${diff.path} (${DIFF_KIND_LABEL[diff.kind]})`}
        >
          <GitCompare size={13} strokeWidth={1.75} className="shrink-0 text-muted" />
          {basename(diff.path)}
          <span className="text-[10px] uppercase tracking-wide text-muted">{DIFF_KIND_LABEL[diff.kind]}</span>
        </Tab>
      ))}
    </div>
  )
}
