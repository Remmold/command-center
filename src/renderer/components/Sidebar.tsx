import { useEffect, useMemo } from 'react'
import { FolderPlus, X } from 'lucide-react'
import type { Workspace } from '../../shared/types'
import { groupByRepo, type RepoGroupView } from '../../shared/repoGroups'
import { useWorkspacesStore } from '../state/workspacesStore'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { RepoIcon } from './RepoIcon'

export function Sidebar() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const load = useWorkspacesStore((s) => s.load)
  const add = useWorkspacesStore((s) => s.add)
  const openProject = useProjectViewsStore((s) => s.openProject)

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => groupByRepo(workspaces), [workspaces])

  const handleAdd = async () => {
    const added = await add()
    if (added) openProject(added)
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          workspaces
        </span>
        <button
          onClick={handleAdd}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="add a workspace"
          aria-label="add a workspace"
        >
          <FolderPlus size={14} strokeWidth={2} />
        </button>
      </div>
      <ul className="scrollbar-thin flex-1 overflow-y-auto py-1">
        {groups.length === 0 && (
          <li className="px-3 py-4 text-xs text-zinc-500">no workspaces yet</li>
        )}
        {groups.map((group) => (
          <RepoGroupItem key={group.repoGroupKey} group={group} />
        ))}
      </ul>
    </aside>
  )
}

function RepoGroupItem({ group }: { group: RepoGroupView }) {
  return (
    <li className="pb-1">
      <div className="flex items-center gap-2 px-3 py-1.5" title={group.repoName}>
        <RepoIcon repoGroupKey={group.repoGroupKey} repoName={group.repoName} />
        <span className="truncate text-xs font-semibold text-zinc-300">{group.repoName}</span>
      </div>
      <ul>
        {group.workspaces.map((w) => (
          <WorkspaceRow key={w.id} workspace={w} />
        ))}
      </ul>
    </li>
  )
}

function WorkspaceRow({ workspace }: { workspace: Workspace }) {
  const removeWorkspace = useWorkspacesStore((s) => s.remove)
  const openProject = useProjectViewsStore((s) => s.openProject)
  const closeProject = useProjectViewsStore((s) => s.closeProject)
  const active = useProjectViewsStore((s) => s.activeProjectId === workspace.id)
  const open = useProjectViewsStore((s) => !!s.views[workspace.id])

  const label = workspace.worktreeTag || workspace.name

  return (
    <li
      onClick={() => openProject(workspace)}
      title={workspace.path}
      className={
        'group flex cursor-pointer items-center gap-2 py-1 pl-6 pr-2 text-xs ' +
        (active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')
      }
    >
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {open && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="open" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          closeProject(workspace.id)
          void removeWorkspace(workspace.id)
        }}
        className="rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
        aria-label={`forget ${workspace.name}`}
        title="forget this workspace"
      >
        <X size={11} strokeWidth={2.25} />
      </button>
    </li>
  )
}
