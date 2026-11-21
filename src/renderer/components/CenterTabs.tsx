import { GitCompare, MessageCircle, X } from 'lucide-react'
import { useWorkspacesStore } from '../state/workspacesStore'
import { RepoIcon } from './RepoIcon'
import { Badge } from './ui/Badge'
import { ClaudePane } from './ClaudePane'
import { DiffPane } from './DiffPane'
import { EditorPane } from './files/EditorPane'
import { useProjectViewsStore } from '../state/projectViewsStore'
import type { ProjectView } from '../state/projectViewsStore'
import { basename } from './files/fileTreeUtil'
import { getFileIcon } from './files/fileIcons'

interface Props {
  view: ProjectView
  chatOnly?: boolean
  registerFocus?: (fn: () => void) => void
}

const DIFF_KIND_LABEL: Record<string, string> = {
  staged: 'staged',
  unstaged: 'working',
  untracked: 'new'
}

const DIFF_KIND_COLOR: Record<string, string> = {
  staged: 'text-blue-300',
  unstaged: 'text-amber-300',
  untracked: 'text-emerald-300'
}

export function CenterTabs({ view, chatOnly = false, registerFocus }: Props) {
  const setCenterView = useProjectViewsStore((s) => s.setCenterView)
  const setActiveFile = useProjectViewsStore((s) => s.setActiveFile)
  const closeFile = useProjectViewsStore((s) => s.closeFile)
  const setActiveDiff = useProjectViewsStore((s) => s.setActiveDiff)
  const closeDiff = useProjectViewsStore((s) => s.closeDiff)
  const workspace = useWorkspacesStore((s) => s.workspaces.find((w) => w.id === view.projectId))

  const chatActive = chatOnly || view.centerView === 'chat'
  const fileActive = !chatOnly && view.centerView === 'file'
  const diffActive = !chatOnly && view.centerView === 'diff'

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div
        className={
          'scrollbar-thin flex shrink-0 items-center overflow-x-auto border-b border-zinc-800 bg-zinc-950/60 ' +
          (chatOnly ? 'hidden' : '')
        }
      >
        <button
          onClick={() => setCenterView(view.projectId, 'chat')}
          className={
            'flex shrink-0 items-center gap-1.5 border-r border-zinc-800 px-3 py-1.5 text-xs ' +
            (chatActive
              ? 'bg-zinc-900 text-zinc-100'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')
          }
          title="claude chat"
        >
          {workspace ? (
            <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
          ) : (
            <MessageCircle size={13} strokeWidth={2} className="text-blue-400" />
          )}
          {workspace?.worktreeTag && <Badge>{workspace.worktreeTag}</Badge>}
          <span>chat</span>
        </button>
        {view.openFiles.map((file) => {
          const active = fileActive && view.activeFilePath === file.path
          const name = basename(file.path)
          const { icon: Icon, color } = getFileIcon(name)
          return (
            <div
              key={file.path}
              className={
                'group flex shrink-0 items-center gap-1.5 border-r border-zinc-800 px-3 py-1.5 text-xs ' +
                (active
                  ? 'bg-zinc-900 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')
              }
            >
              <Icon size={13} strokeWidth={1.75} className={`shrink-0 ${color}`} />
              <button
                onClick={() => {
                  setActiveFile(view.projectId, file.path)
                  setCenterView(view.projectId, 'file')
                }}
                className="truncate"
                title={file.path}
              >
                {name}
                {file.dirty && <span className="ml-1 text-amber-400">●</span>}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeFile(view.projectId, file.path)
                }}
                className="rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
                aria-label={`close ${file.path}`}
              >
                <X size={11} strokeWidth={2.25} />
              </button>
            </div>
          )
        })}
        {(view.openDiffs ?? []).map((diff) => {
          const active = diffActive && view.activeDiffId === diff.id
          const name = basename(diff.path)
          return (
            <div
              key={diff.id}
              className={
                'group flex shrink-0 items-center gap-1.5 border-r border-zinc-800 px-3 py-1.5 text-xs ' +
                (active
                  ? 'bg-zinc-900 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')
              }
            >
              <GitCompare size={13} strokeWidth={1.75} className="shrink-0 text-emerald-400" />
              <button
                onClick={() => {
                  setActiveDiff(view.projectId, diff.id)
                  setCenterView(view.projectId, 'diff')
                }}
                className="truncate"
                title={`${diff.path} (${DIFF_KIND_LABEL[diff.kind]})`}
              >
                {name}
                <span
                  className={`ml-1 text-[10px] uppercase tracking-wide ${DIFF_KIND_COLOR[diff.kind]}`}
                >
                  {DIFF_KIND_LABEL[diff.kind]}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeDiff(view.projectId, diff.id)
                }}
                className="rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
                aria-label={`close diff for ${diff.path}`}
              >
                <X size={11} strokeWidth={2.25} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="relative min-h-0 flex-1 bg-zinc-950">
        <div className={'absolute inset-0 ' + (chatActive ? '' : 'invisible')}>
          <ClaudePane view={view} registerFocus={chatActive ? registerFocus : undefined} />
        </div>
        <div className={'absolute inset-0 ' + (fileActive ? '' : 'invisible')}>
          <EditorPane view={view} />
        </div>
        <div className={'absolute inset-0 ' + (diffActive ? '' : 'invisible')}>
          <DiffPane view={view} />
        </div>
      </div>
    </section>
  )
}
