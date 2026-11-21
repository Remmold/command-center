import { Fragment, useEffect, useMemo } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { OBSERVED_STATUS_LABEL, type Workspace } from '../../shared/types'
import { groupByRepo, type RepoGroupView } from '../../shared/repoGroups'
import { useWorkspacesStore } from '../state/workspacesStore'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { RepoIcon, RepoName } from './RepoIcon'
import { RepoIdentityEditor } from './RepoIdentityEditor'
import { StatusDot } from './ui/StatusDot'
import { NeedsYouQueue } from './NeedsYouQueue'
import { ProfilePicker } from './ProfilePicker'
import { useProfilesStore } from '../state/profilesStore'
import { useWorkspaceStatus } from '../state/sessionStatusStore'
import { useObservedSessions, useObservedStore } from '../state/observedStore'
import { ListRow, ListRowText } from './ui/ListRow'
import { Badge } from './ui/Badge'

export function Sidebar() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const load = useWorkspacesStore((s) => s.load)
  const add = useWorkspacesStore((s) => s.add)
  const openProject = useProjectViewsStore((s) => s.openProject)
  const loadProfiles = useProfilesStore((s) => s.load)

  useEffect(() => {
    void load()
    void loadProfiles()
  }, [load, loadProfiles])

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
      <NeedsYouQueue />
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
      <div className="group flex items-center gap-2 py-1.5 pl-3 pr-2" title={group.repoName}>
        <RepoIcon repoGroupKey={group.repoGroupKey} repoName={group.repoName} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-300">
          <RepoName repoGroupKey={group.repoGroupKey} repoName={group.repoName} />
        </span>
        <RepoIdentityEditor group={group} />
      </div>
      <ul>
        {group.workspaces.map((w) => (
          <Fragment key={w.id}>
            <WorkspaceRow workspace={w} />
            <ObservedRows workspace={w} />
          </Fragment>
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
  const status = useWorkspaceStatus(workspace.id)
  const closeObserved = useObservedStore((s) => s.close)

  const label = workspace.worktreeTag || workspace.name

  return (
    <li
      onClick={() => {
        closeObserved()
        openProject(workspace)
      }}
      title={workspace.path}
      className={
        'group flex cursor-pointer items-center gap-2 py-1 pl-6 pr-2 text-xs ' +
        (active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')
      }
    >
      <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {status && <StatusDot status={status} />}
      <ProfilePicker workspace={workspace} />
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

function ObservedRows({ workspace }: { workspace: Workspace }) {
  const sessions = useObservedSessions(workspace.id)
  const open = useObservedStore((s) => s.open)
  const viewing = useObservedStore((s) => (s.viewing?.workspaceId === workspace.id ? s.viewing.sessionId : null))
  return (
    <>
      {sessions.map((o) => (
        <ListRow
          key={o.sessionId}
          nested
          active={viewing === o.sessionId}
          onClick={() => void open(workspace, o.sessionId)}
          tooltip={`${o.title} · ${OBSERVED_STATUS_LABEL[o.status]} · in VS Code (read-only)`}
        >
          <StatusDot status={o.status} />
          <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
          <ListRowText primary={o.title} />
          <Badge>in VS Code</Badge>
        </ListRow>
      ))}
    </>
  )
}
