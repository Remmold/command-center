import { useEffect } from 'react'
import { useProjectsStore } from '../state/projectsStore'
import { useProjectViewsStore } from '../state/projectViewsStore'

export function Sidebar() {
  const projects = useProjectsStore((s) => s.projects)
  const load = useProjectsStore((s) => s.load)
  const add = useProjectsStore((s) => s.add)
  const removeProject = useProjectsStore((s) => s.remove)

  const openProject = useProjectViewsStore((s) => s.openProject)
  const closeProject = useProjectViewsStore((s) => s.closeProject)
  const activeProjectId = useProjectViewsStore((s) => s.activeProjectId)
  const views = useProjectViewsStore((s) => s.views)

  useEffect(() => {
    load()
  }, [load])

  const handleRemove = (id: string) => {
    closeProject(id)
    void removeProject(id)
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          projects
        </span>
        <button
          onClick={add}
          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
        >
          + add
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {projects.length === 0 && (
          <li className="px-3 py-4 text-xs text-zinc-500">no projects yet</li>
        )}
        {projects.map((p) => {
          const active = p.id === activeProjectId
          const open = !!views[p.id]
          return (
            <li
              key={p.id}
              onClick={() => openProject(p)}
              className={
                'group flex cursor-pointer items-center justify-between px-3 py-2 ' +
                (active ? 'bg-zinc-800' : 'hover:bg-zinc-900')
              }
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-zinc-100">{p.name}</span>
                  {open && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                      aria-label="session running"
                    />
                  )}
                </div>
                <div className="truncate text-xs text-zinc-500">{p.path}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(p.id)
                }}
                className="ml-2 text-xs text-zinc-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
                aria-label={`remove ${p.name}`}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
