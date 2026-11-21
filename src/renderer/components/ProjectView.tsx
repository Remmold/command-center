import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import {
  Group,
  Panel,
  Separator,
  type PanelImperativeHandle
} from 'react-resizable-panels'
import { CenterTabs } from './CenterTabs'
import { ShellTabs } from './ShellTabs'
import { FileTree } from './files/FileTree'
import { SourceControlPanel } from './SourceControlPanel'
import { useProjectViewsStore } from '../state/projectViewsStore'
import type { ProjectView as ProjectViewType } from '../state/projectViewsStore'

interface Props {
  view: ProjectViewType
  registerFocus?: (fn: () => void) => void
}

const DEFAULT_BOTTOM_PCT = 30
const OPEN_THRESHOLD_PCT = 1

export function ProjectView({ view, registerFocus }: Props) {
  const setBottomPanelOpen = useProjectViewsStore((s) => s.setBottomPanelOpen)
  const addShellTab = useProjectViewsStore((s) => s.addShellTab)
  const openFile = useProjectViewsStore((s) => s.openFile)
  const activityView = useProjectViewsStore((s) => s.activityView)
  const sidePanelOpen = activityView !== null

  const bottomPanelRef = useRef<PanelImperativeHandle>(null)

  // Sync store → panel imperatively. When the desired open state differs
  // from the panel's current collapsed state, command it. The reverse direction
  // (panel drag → store) flows through onResize below.
  useEffect(() => {
    const panel = bottomPanelRef.current
    if (!panel) return
    const isCollapsed = panel.isCollapsed()
    if (view.bottomPanelOpen && isCollapsed) panel.expand()
    if (!view.bottomPanelOpen && !isCollapsed) panel.collapse()
  }, [view.bottomPanelOpen])

  const handleOpenFile = async (relativePath: string) => {
    try {
      const res = await window.api.files.read(view.projectPath, relativePath)
      if (!res.ok) {
        alert(`failed to open ${relativePath}: ${res.error ?? 'unknown error'}`)
        console.error('[files.read] failed', { relativePath, res })
        return
      }
      openFile(view.projectId, {
        path: relativePath,
        content: res.content ?? '',
        dirty: false,
        binary: res.binary
      })
    } catch (err) {
      console.error('[files.read] threw', err)
      alert(`error opening ${relativePath}: ${(err as Error).message}`)
    }
  }

  const handleBottomResize = (size: { asPercentage: number }) => {
    const isOpen = size.asPercentage > OPEN_THRESHOLD_PCT
    if (isOpen !== view.bottomPanelOpen) {
      setBottomPanelOpen(view.projectId, isOpen)
      if (isOpen && view.shellTabs.length === 0) {
        addShellTab(view.projectId, 'pwsh')
      }
    }
  }

  const handleFooterToggle = () => {
    const willOpen = !view.bottomPanelOpen
    setBottomPanelOpen(view.projectId, willOpen)
    if (willOpen && view.shellTabs.length === 0) {
      addShellTab(view.projectId, 'pwsh')
    }
  }

  const bottomDefault = view.bottomPanelOpen ? `${DEFAULT_BOTTOM_PCT}%` : '0%'

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal" id={`outer-${view.projectId}`} className="h-full">
          {sidePanelOpen && (
            <>
              <Panel defaultSize="20%" minSize="10%" collapsible>
                {activityView === 'explorer' && (
                  <FileTree
                    cwd={view.projectPath}
                    onOpenFile={handleOpenFile}
                    activeFilePath={view.activeFilePath}
                  />
                )}
                {activityView === 'sourceControl' && (
                  <SourceControlPanel cwd={view.projectPath} projectId={view.projectId} />
                )}
              </Panel>
              <Separator className="w-px bg-zinc-800 hover:w-1 hover:bg-zinc-700" />
            </>
          )}
          <Panel defaultSize={sidePanelOpen ? '80%' : '100%'} minSize="40%">
            <Group orientation="vertical" id={`vert-${view.projectId}`} className="h-full">
              <Panel defaultSize={view.bottomPanelOpen ? '70%' : '100%'} minSize="20%">
                <CenterTabs view={view} registerFocus={registerFocus} />
              </Panel>
              <Separator className="h-1 bg-zinc-900 transition-colors hover:bg-blue-500/50 active:bg-blue-500/70" />
              <Panel
                panelRef={bottomPanelRef}
                defaultSize={bottomDefault}
                minSize="10%"
                collapsible
                collapsedSize="0%"
                onResize={handleBottomResize}
              >
                <ShellTabs view={view} />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] text-zinc-500">
        <span className="flex items-center gap-3">
          <span>
            {view.openFiles.length} file{view.openFiles.length === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>
            {view.shellTabs.length} shell{view.shellTabs.length === 1 ? '' : 's'}
          </span>
        </span>
        <button
          onClick={handleFooterToggle}
          className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
          title={view.bottomPanelOpen ? 'hide terminal panel' : 'show terminal panel'}
        >
          <Terminal size={12} strokeWidth={2} />
          <span>terminals</span>
          {view.bottomPanelOpen ? (
            <ChevronDown size={12} strokeWidth={2.25} />
          ) : (
            <ChevronUp size={12} strokeWidth={2.25} />
          )}
        </button>
      </footer>
    </div>
  )
}
