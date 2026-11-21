import { useState } from 'react'
import { ChevronDown, Plus, SplitSquareVertical, Terminal, Trash2 } from 'lucide-react'
import { Terminal as PtyTerminal } from './Terminal'
import { useProjectViewsStore } from '../state/projectViewsStore'
import type { ProjectView } from '../state/projectViewsStore'
import type { PtyKind } from '../../shared/types'

interface Props {
  view: ProjectView
}

interface ShellOption {
  kind: PtyKind
  label: string
}

const SHELL_OPTIONS: ShellOption[] = [
  { kind: 'pwsh', label: 'PowerShell' },
  { kind: 'powershell', label: 'Windows PowerShell' },
  { kind: 'cmd', label: 'Command Prompt' },
  { kind: 'bash', label: 'Bash' }
]

const SHELL_LABEL: Record<string, string> = {
  pwsh: 'pwsh',
  powershell: 'powershell',
  cmd: 'cmd',
  bash: 'bash'
}

const SHELL_COLOR: Record<string, string> = {
  pwsh: 'text-blue-400',
  powershell: 'text-blue-400',
  cmd: 'text-muted',
  bash: 'text-emerald-400'
}

export function ShellTabs({ view }: Props) {
  const addShellTab = useProjectViewsStore((s) => s.addShellTab)
  const closeShellTab = useProjectViewsStore((s) => s.closeShellTab)
  const setActiveShellTab = useProjectViewsStore((s) => s.setActiveShellTab)

  const [pickerOpen, setPickerOpen] = useState(false)

  const activeTab = view.shellTabs.find((t) => t.id === view.activeShellTabId) ?? null
  const showSidebar = view.shellTabs.length > 1

  const handleAddDefault = () => {
    addShellTab(view.projectId, 'pwsh')
    setPickerOpen(false)
  }

  const handleAddSpecific = (kind: PtyKind) => {
    addShellTab(view.projectId, kind)
    setPickerOpen(false)
  }

  const handleKillAll = () => {
    if (view.shellTabs.length === 0) return
    const ok = confirm(`Kill all ${view.shellTabs.length} shell(s)?`)
    if (!ok) return
    for (const tab of view.shellTabs) {
      closeShellTab(view.projectId, tab.id)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-editor">
      {/* top bar — title + actions */}
      <header className="flex shrink-0 items-center justify-between border-b border-subtle bg-editor px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {activeTab ? (
            <>
              <Terminal
                size={12}
                strokeWidth={2}
                className={SHELL_COLOR[activeTab.kind] ?? 'text-muted'}
              />
              <span className="truncate text-fg">{activeTab.label}</span>
              <span className="text-[10px] text-muted">
                {SHELL_LABEL[activeTab.kind] ?? activeTab.kind}
              </span>
            </>
          ) : (
            <span className="text-muted italic">no shells</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <div className="relative flex items-center">
            <button
              onClick={handleAddDefault}
              className="flex items-center gap-1 rounded-l px-2 py-1 text-xs text-muted hover:bg-list-hover hover:text-fg"
              title="new pwsh terminal"
            >
              <Plus size={13} strokeWidth={2} />
            </button>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="rounded-r px-1 py-1 text-muted hover:bg-list-hover hover:text-fg"
              title="pick shell type"
            >
              <ChevronDown size={11} strokeWidth={2} />
            </button>
            {pickerOpen && (
              <div
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-subtle bg-widget shadow-xl"
                onMouseLeave={() => setPickerOpen(false)}
              >
                <div className="border-b border-subtle px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  new terminal
                </div>
                {SHELL_OPTIONS.map((opt) => (
                  <button
                    key={opt.kind}
                    onClick={() => handleAddSpecific(opt.kind)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-list-hover"
                  >
                    <Terminal
                      size={12}
                      strokeWidth={2}
                      className={SHELL_COLOR[opt.kind] ?? 'text-muted'}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeTab && (
            <button
              onClick={() => {
                // "split" — just spawn another tab of the same kind
                addShellTab(view.projectId, activeTab.kind)
              }}
              className="rounded p-1 text-muted hover:bg-list-hover hover:text-fg"
              title="split (new terminal of same type)"
            >
              <SplitSquareVertical size={13} strokeWidth={2} />
            </button>
          )}
          {view.shellTabs.length > 0 && (
            <button
              onClick={handleKillAll}
              className="rounded p-1 text-muted hover:bg-list-hover hover:text-red-400"
              title="kill all shells"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      {/* body — terminal content (left) + shell list (right, when >1) */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-editor">
          {view.shellTabs.map((tab) => {
            const active = tab.id === view.activeShellTabId
            return (
              <div
                key={tab.id}
                className={'absolute inset-0 p-1 ' + (active ? '' : 'invisible')}
              >
                <PtyTerminal
                  paneId={tab.id}
                  kind={tab.kind as PtyKind}
                  cwd={view.projectPath}
                  env={tab.env}
                />
              </div>
            )
          })}
          {view.shellTabs.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-faint">
              click + to spawn a terminal
            </div>
          )}
        </div>

        {showSidebar && (
          <aside className="scrollbar-thin w-48 shrink-0 overflow-y-auto border-l border-subtle bg-sidebar">
            {view.shellTabs.map((tab) => {
              const active = tab.id === view.activeShellTabId
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveShellTab(view.projectId, tab.id)}
                  className={
                    'group relative flex cursor-pointer items-center gap-2 border-l-2 px-3 py-1.5 text-xs ' +
                    (active
                      ? 'border-accent bg-list-selected text-fg'
                      : 'border-transparent text-muted hover:bg-list-hover hover:text-fg')
                  }
                  title={tab.kind}
                >
                  <Terminal
                    size={12}
                    strokeWidth={2}
                    className={`shrink-0 ${SHELL_COLOR[tab.kind] ?? 'text-muted'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        addShellTab(view.projectId, tab.kind)
                      }}
                      className="rounded p-0.5 text-muted hover:bg-list-hover hover:text-fg"
                      title="split (new terminal of same type)"
                      aria-label="split"
                    >
                      <SplitSquareVertical size={11} strokeWidth={2.25} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeShellTab(view.projectId, tab.id)
                      }}
                      className="rounded p-0.5 text-muted hover:bg-list-hover hover:text-red-400"
                      title="shut down terminal"
                      aria-label={`shut down ${tab.label}`}
                    >
                      <Trash2 size={11} strokeWidth={2.25} />
                    </button>
                  </div>
                </div>
              )
            })}
          </aside>
        )}
      </div>
    </section>
  )
}
