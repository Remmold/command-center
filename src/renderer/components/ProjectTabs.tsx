import { useEffect, useState } from 'react'
import { Folder, FolderPlus, FolderSearch, LayoutGrid, X } from 'lucide-react'
import { useWorkspacesStore } from '../state/workspacesStore'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useAppsStore } from '../state/appsStore'
import { useViewStore, type AppView } from '../state/viewStore'
import { SegmentedControl } from './ui/SegmentedControl'
import { UsageStrip } from './UsageStrip'

export function ProjectTabs() {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const loadWorkspaces = useWorkspacesStore((s) => s.load)
  const addWorkspace = useWorkspacesStore((s) => s.add)
  const removeWorkspace = useWorkspacesStore((s) => s.remove)

  const order = useProjectViewsStore((s) => s.order)
  const views = useProjectViewsStore((s) => s.views)
  const activeProjectId = useProjectViewsStore((s) => s.activeProjectId)
  const openProject = useProjectViewsStore((s) => s.openProject)
  const closeProject = useProjectViewsStore((s) => s.closeProject)
  const setActive = useProjectViewsStore((s) => s.setActive)

  const showApps = useAppsStore((s) => s.showApps)
  const setShowApps = useAppsStore((s) => s.setShowApps)

  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)

  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  const closedWorkspaces = workspaces.filter((p) => !views[p.id])

  const handleAddNew = async () => {
    setMenuOpen(false)
    const added = await addWorkspace()
    if (added) openProject(added)
  }

  const handleOpenSaved = (projectId: string) => {
    const proj = workspaces.find((p) => p.id === projectId)
    if (proj) openProject(proj)
    setMenuOpen(false)
  }

  return (
    <div className="relative flex h-10 shrink-0 items-center border-b border-zinc-800 bg-zinc-950">
      <div className="shrink-0 border-r border-zinc-800 px-2">
        <SegmentedControl<AppView>
          label="view"
          value={view}
          onChange={setView}
          options={[
            { value: 'sessions', label: 'Sessions', title: 'Sessions (Ctrl+1)' },
            { value: 'board', label: 'Board', title: 'Board (Ctrl+2)' }
          ]}
        />
      </div>
      <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
        {order.length === 0 && (
          <span className="px-3 text-xs text-zinc-500">
            no workspaces open · click + to open one
          </span>
        )}
        {order.map((projectId) => {
          const view = views[projectId]
          if (!view) return null
          const active = projectId === activeProjectId
          return (
            <div
              key={projectId}
              onClick={() => setActive(projectId)}
              className={
                'group flex h-full cursor-pointer items-center gap-2 border-r border-zinc-800 px-3 text-xs transition-colors ' +
                (active
                  ? 'bg-zinc-900 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')
              }
            >
              <Folder
                size={13}
                strokeWidth={1.75}
                className={active ? 'text-blue-400' : 'text-zinc-500'}
              />
              <span className="truncate" title={view.projectPath}>
                {view.projectName}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeProject(projectId)
                }}
                className="rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
                aria-label={`close ${view.projectName}`}
                title="close workspace"
              >
                <X size={11} strokeWidth={2.25} />
              </button>
            </div>
          )
        })}
      </div>
      <UsageStrip />
      <button
        onClick={() => setShowApps(!showApps)}
        className={
          'flex h-full items-center gap-1.5 border-l border-zinc-800 px-3 text-xs ' +
          (showApps
            ? 'bg-zinc-900 text-blue-400'
            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100')
        }
        title="apps — launch & monitor"
      >
        <LayoutGrid size={14} strokeWidth={2} />
        <span>Apps</span>
      </button>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-full items-center gap-1 px-3 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          title="open a workspace"
        >
          <FolderPlus size={14} strokeWidth={2} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-zinc-800 bg-zinc-950 shadow-xl"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="border-b border-zinc-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              recent
            </div>
            {closedWorkspaces.length === 0 && (
              <div className="px-3 py-2 text-xs italic text-zinc-500">
                all saved workspaces are open
              </div>
            )}
            {closedWorkspaces.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-zinc-900"
              >
                <Folder size={13} strokeWidth={1.75} className="shrink-0 text-zinc-500" />
                <button
                  onClick={() => handleOpenSaved(p.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-zinc-100">{p.name}</div>
                  <div className="truncate text-[10px] text-zinc-500">{p.path}</div>
                </button>
                <button
                  onClick={() => removeWorkspace(p.id)}
                  className="rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
                  title="forget this workspace"
                >
                  <X size={11} strokeWidth={2.25} />
                </button>
              </div>
            ))}
            <button
              onClick={handleAddNew}
              className="flex w-full items-center gap-2 border-t border-zinc-800 px-3 py-2 text-left text-xs text-zinc-100 hover:bg-zinc-900"
            >
              <FolderSearch size={14} strokeWidth={1.75} className="text-blue-400" />
              <span>browse for new workspace…</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
