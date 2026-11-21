import { useEffect, useRef } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import { useObservedStore } from '../../state/observedStore'
import { chatOnScreen } from '../../state/projectViewLayout'
import { useProjectViewsStore, type ProjectView } from '../../state/projectViewsStore'
import { useOpenTarget } from '../../state/workSessions'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { ActivityBar } from '../ActivityBar'
import { ChatView } from '../chat/ChatView'
import { ObservedChatView } from '../chat/ObservedChatView'
import { DiffPane } from '../DiffPane'
import { EditorPane } from '../files/EditorPane'
import { FileTree } from '../files/FileTree'
import { ShellTabs } from '../ShellTabs'
import { SourceControlPanel } from '../SourceControlPanel'
import { EmptyState } from '../ui/EmptyState'
import { EditorTabs } from './EditorTabs'
import { HostedSessionHeader, ObservedSessionHeader } from './SessionHeader'
import { SessionList } from './SessionList'

const DRAWER_OPEN_THRESHOLD_PCT = 1

/** Kept mounted but out of sight, so processes, terminals and scroll positions survive. */
function Layer({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div className={'absolute inset-0 ' + (shown ? '' : 'invisible')} aria-hidden={!shown}>
      {children}
    </div>
  )
}

export function WorkView({ registerFocus }: { registerFocus: (fn: () => void) => void }) {
  return (
    <Group orientation="horizontal" id="work" className="h-full">
      <Panel id="session-list" defaultSize="300px" minSize="180px" maxSize="50%">
        <SessionList />
      </Panel>
      <Separator className="w-px bg-subtle hover:w-1 hover:bg-focus" />
      <Panel id="work-main" minSize="40%">
        <WorkMain registerFocus={registerFocus} />
      </Panel>
    </Group>
  )
}

function WorkMain({ registerFocus }: { registerFocus: (fn: () => void) => void }) {
  const target = useOpenTarget()
  const views = useProjectViewsStore((s) => s.views)
  const order = useProjectViewsStore((s) => s.order)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const observedSession = useObservedStore((s) =>
    target?.kind === 'observed'
      ? s.sessions.find((o) => o.workspaceId === target.workspaceId && o.sessionId === target.sessionId)
      : undefined
  )

  const workspace = target ? workspaces.find((w) => w.id === target.workspaceId) : undefined
  const hostedView = target?.kind === 'hosted' ? views[target.workspaceId] : undefined
  const hostedSession = target?.kind === 'hosted' ? hostedView?.claudeSessions.find((c) => c.id === target.paneId) : undefined
  const toolsView = hostedView && hostedSession ? hostedView : undefined
  const ideOpen = toolsView?.idePanelsOpen ?? false

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-editor">
      {workspace && toolsView && hostedSession && (
        <HostedSessionHeader workspace={workspace} view={toolsView} session={hostedSession} />
      )}
      {workspace && target?.kind === 'observed' && (
        <ObservedSessionHeader workspace={workspace} session={observedSession} sessionId={target.sessionId} />
      )}
      <div className="flex min-h-0 flex-1">
        {ideOpen && <ActivityBar />}
        <div className="min-w-0 flex-1">
          <WorkspaceTools view={toolsView}>
            {toolsView && ideOpen && <EditorTabs view={toolsView} />}
            <div className="relative min-h-0 flex-1">
              {order.map((id) => {
                const view = views[id]
                if (!view) return null
                const here = view === toolsView && target?.kind === 'hosted'
                return view.claudeSessions.map((c) => {
                  const shown = here && c.id === target.paneId && chatOnScreen(view)
                  return (
                    <Layer key={c.id} shown={shown}>
                      <ChatView
                        paneId={c.id}
                        cwd={view.projectPath}
                        model={c.model}
                        resumeSessionId={c.claudeSessionId}
                        permissionMode={c.permissionMode}
                        registerFocus={shown ? registerFocus : undefined}
                      />
                    </Layer>
                  )
                })
              })}
              {order.map((id) => {
                const view = views[id]
                if (!view) return null
                const editing = view === toolsView && view.idePanelsOpen
                return [
                  <Layer key={`file-${id}`} shown={editing && view.centerView === 'file'}>
                    <EditorPane view={view} />
                  </Layer>,
                  <Layer key={`diff-${id}`} shown={editing && view.centerView === 'diff'}>
                    <DiffPane view={view} />
                  </Layer>
                ]
              })}
              {target?.kind === 'observed' && (
                <div className="absolute inset-0">
                  <ObservedChatView />
                </div>
              )}
              {!target && <EmptyState>Pick a session in the list.</EmptyState>}
              {target?.kind === 'hosted' && !hostedSession && <EmptyState>This workspace has no session open. Press Ctrl+T to start one.</EmptyState>}
            </div>
          </WorkspaceTools>
        </div>
      </div>
    </div>
  )
}

/** The open workspace's file tree / source control on the left and its shell drawer below. */
function WorkspaceTools({ view, children }: { view: ProjectView | undefined; children: React.ReactNode }) {
  const activityView = useProjectViewsStore((s) => s.activityView)
  const views = useProjectViewsStore((s) => s.views)
  const order = useProjectViewsStore((s) => s.order)
  const setShellDrawerOpen = useProjectViewsStore((s) => s.setShellDrawerOpen)
  const openFile = useProjectViewsStore((s) => s.openFile)
  const drawerRef = useRef<PanelImperativeHandle>(null)

  const sidePanelOpen = !!view?.idePanelsOpen && activityView !== null
  const drawerOpen = !!view && view.shellDrawerOpen && view.shellTabs.length > 0
  const anyShells = order.some((id) => (views[id]?.shellTabs.length ?? 0) > 0)

  const drawerRegistered = useRef(false)

  // The drawer collapses instead of unmounting so every workspace's terminals keep their scrollback.
  useEffect(() => {
    const panel = drawerRef.current
    // A panel's imperative API throws until its group has registered it; a new panel starts at defaultSize anyway.
    if (!panel || !drawerRegistered.current) {
      drawerRegistered.current = !!panel
      return
    }
    if (drawerOpen && panel.isCollapsed()) panel.expand()
    if (!drawerOpen && !panel.isCollapsed()) panel.collapse()
  }, [drawerOpen, anyShells])

  const handleDrawerResize = (size: { asPercentage: number }) => {
    if (!view) return
    const open = size.asPercentage > DRAWER_OPEN_THRESHOLD_PCT
    if (open !== view.shellDrawerOpen) setShellDrawerOpen(view.projectId, open)
  }

  const handleOpenFile = async (relativePath: string) => {
    if (!view) return
    try {
      const res = await window.api.files.read(view.projectPath, relativePath)
      if (!res.ok) {
        alert(`failed to open ${relativePath}: ${res.error ?? 'unknown error'}`)
        return
      }
      openFile(view.projectId, { path: relativePath, content: res.content ?? '', dirty: false, binary: res.binary })
    } catch (err) {
      alert(`error opening ${relativePath}: ${(err as Error).message}`)
    }
  }

  return (
    <Group orientation="horizontal" id="work-tools" className="h-full">
      {view && sidePanelOpen && (
        <>
          <Panel id="side" defaultSize="20%" minSize="10%" collapsible>
            {activityView === 'explorer' && (
              <FileTree key={view.projectId} cwd={view.projectPath} onOpenFile={handleOpenFile} activeFilePath={view.activeFilePath} />
            )}
            {activityView === 'sourceControl' && (
              <SourceControlPanel key={view.projectId} cwd={view.projectPath} projectId={view.projectId} />
            )}
          </Panel>
          <Separator className="w-px bg-subtle hover:w-1 hover:bg-focus" />
        </>
      )}
      <Panel id="center-and-shells" minSize="40%">
        <Group orientation="vertical" id="work-center" className="h-full">
          <Panel id="center" minSize="20%">
            <div className="flex h-full min-h-0 flex-col">{children}</div>
          </Panel>
          {anyShells && (
            <>
              <Separator
                className={
                  'h-1 bg-sidebar transition-colors hover:bg-focus/50 active:bg-focus/70 ' + (drawerOpen ? '' : 'hidden')
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
                <div className="relative h-full">
                  {order.map((id) => {
                    const v = views[id]
                    if (!v || v.shellTabs.length === 0) return null
                    return (
                      <Layer key={id} shown={v.projectId === view?.projectId}>
                        <ShellTabs view={v} />
                      </Layer>
                    )
                  })}
                </div>
              </Panel>
            </>
          )}
        </Group>
      </Panel>
    </Group>
  )
}
