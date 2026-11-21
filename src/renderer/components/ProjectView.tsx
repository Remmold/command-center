import { PanelLeft, Terminal } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import { CenterTabs } from './CenterTabs'
import { ShellTabs } from './ShellTabs'
import { FileTree } from './files/FileTree'
import { SourceControlPanel } from './SourceControlPanel'
import { Button } from './ui/Button'
import { useProjectViewsStore } from '../state/projectViewsStore'
import type { ProjectView as ProjectViewType } from '../state/projectViewsStore'
import { IDE_PANELS_SHORTCUT, SHELL_DRAWER_SHORTCUT } from '../hooks/useKeyboardShortcuts'

const DRAWER_OPEN_THRESHOLD_PCT = 1

interface Props {
  view: ProjectViewType
  registerFocus?: (fn: () => void) => void
}

export function ProjectView({ view, registerFocus }: Props) {
  const toggleIdePanels = useProjectViewsStore((s) => s.toggleIdePanels)
  const toggleShellDrawer = useProjectViewsStore((s) => s.toggleShellDrawer)
  const openFile = useProjectViewsStore((s) => s.openFile)
  const activityView = useProjectViewsStore((s) => s.activityView)
  const sidePanelOpen = view.idePanelsOpen && activityView !== null
  const hasShells = view.shellTabs.length > 0
  const drawerOpen = view.shellDrawerOpen && hasShells
  const setShellDrawerOpen = useProjectViewsStore((s) => s.setShellDrawerOpen)
  const drawerRef = useRef<PanelImperativeHandle>(null)

  // The drawer collapses instead of unmounting so the terminals keep their scrollback.
  useEffect(() => {
    const panel = drawerRef.current
    if (!panel) return
    if (drawerOpen && panel.isCollapsed()) panel.expand()
    if (!drawerOpen && !panel.isCollapsed()) panel.collapse()
  }, [drawerOpen])

  const handleDrawerResize = (size: { asPercentage: number }) => {
    const open = size.asPercentage > DRAWER_OPEN_THRESHOLD_PCT
    if (open !== view.shellDrawerOpen) setShellDrawerOpen(view.projectId, open)
  }

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

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal" id={`outer-${view.projectId}`} className="h-full">
          {sidePanelOpen && (
            <>
              <Panel id="side" defaultSize="20%" minSize="10%" collapsible>
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
              <Separator className="w-px bg-subtle hover:w-1 hover:bg-focus" />
            </>
          )}
          <Panel id="main" defaultSize={sidePanelOpen ? '80%' : '100%'} minSize="40%">
            <Group orientation="vertical" id={`vert-${view.projectId}`} className="h-full">
              <Panel id="center" defaultSize={drawerOpen ? '70%' : '100%'} minSize="20%">
                <CenterTabs
                  view={view}
                  chatOnly={!view.idePanelsOpen}
                  registerFocus={registerFocus}
                />
              </Panel>
              {hasShells && (
                <>
                  <Separator
                    className={
                      'h-1 bg-sidebar transition-colors hover:bg-focus/50 active:bg-focus/70 ' +
                      (drawerOpen ? '' : 'hidden')
                    }
                  />
                  <Panel
                    id="shells"
                    panelRef={drawerRef}
                    defaultSize={drawerOpen ? '30%' : '0%'}
                    minSize="10%"
                    collapsible
                    collapsedSize="0%"
                    onResize={handleDrawerResize}
                  >
                    <ShellTabs view={view} />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
        </Group>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-subtle bg-editor px-3 py-0.5 text-[11px] text-muted">
        <span className="flex items-center gap-3">
          <span>
            {view.openFiles.length} file{view.openFiles.length === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>
            {view.shellTabs.length} shell{view.shellTabs.length === 1 ? '' : 's'}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Button
            variant="ghost"
            pressed={view.idePanelsOpen}
            onClick={() => toggleIdePanels(view.projectId)}
            tooltip={`${view.idePanelsOpen ? 'Hide' : 'Show'} file tree, editor and git (${IDE_PANELS_SHORTCUT})`}
          >
            <PanelLeft size={12} strokeWidth={2} />
            <span>IDE panels</span>
          </Button>
          <Button
            variant="ghost"
            pressed={drawerOpen}
            onClick={() => toggleShellDrawer(view.projectId)}
            tooltip={
              view.shellTabs.length === 0
                ? `Open a shell (${SHELL_DRAWER_SHORTCUT})`
                : `${drawerOpen ? 'Hide' : 'Show'} shells (${SHELL_DRAWER_SHORTCUT})`
            }
          >
            <Terminal size={12} strokeWidth={2} />
            <span>shell</span>
          </Button>
        </span>
      </footer>
    </div>
  )
}
