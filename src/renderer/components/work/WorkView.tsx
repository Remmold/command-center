import { memo, useEffect, useMemo, useRef } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import { halfShowing, type HalfIndex } from '../../state/chatPair'
import { useChatPairStore } from '../../state/chatPairStore'
import { useDrawerBorrow, type DrawerSlot } from '../../state/chatDrawer'
import { useObservedStore } from '../../state/observedStore'
import { chatOnScreen } from '../../state/projectViewLayout'
import { useProjectViewsStore, type ActivityView, type ProjectView } from '../../state/projectViewsStore'
import { focusChatHalf } from '../../state/sessionNavigation'
import { useShownChats } from '../../state/workSessions'
import { mainChatWorkspace, useMainChatStore } from '../../state/mainChatStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { ChatView } from '../chat/ChatView'
import { ObservedChatView } from '../chat/ObservedChatView'
import { DiffPane } from '../DiffPane'
import { EditorPane } from '../files/EditorPane'
import { FileTree } from '../files/FileTree'
import { ShellTabs } from '../ShellTabs'
import { SourceControlPanel } from '../SourceControlPanel'
import { EmptyState } from '../ui/EmptyState'
import { SegmentedControl } from '../ui/SegmentedControl'
import { EditorTabs } from './EditorTabs'
import { EmptyHalfHeader, HostedSessionHeader, ObservedSessionHeader, type HalfPlace } from './SessionHeader'
import { SessionList } from './SessionList'
import { PanelLeftOpen } from 'lucide-react'
import { SESSION_LIST_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useSessionListStore } from '../../state/sessionListStore'
import { IconButton } from '../ui/IconButton'
import { Rail } from '../ui/Rail'

const DRAWER_OPEN_THRESHOLD_PCT = 1

type Slot = 'full' | 'left' | 'right'

const SLOT: Record<Slot, string> = {
  full: 'inset-0',
  left: 'inset-y-0 left-0 w-1/2',
  right: 'inset-y-0 right-0 w-1/2 border-l border-subtle'
}

interface LayerProps {
  slot: Slot | null
  /** Called on any click or focus inside, so the half it shows becomes the focused one. */
  onActivate?: () => void
  children: React.ReactNode
  /** Lays the layer over the Dashboard's chat drawer instead, visible though Work is not (ADR 0004). */
  over?: DrawerSlot
}

/**
 * Kept mounted but out of sight while `slot` is null, so processes, terminals and scroll positions survive.
 * Clipped, because anything sticking out of any layer would make the surrounding panel scrollable and shift every layer.
 */
function Layer({ slot, onActivate, children, over }: LayerProps) {
  if (over) {
    // One above App's z-30 view overlays, below Settings (z-40) and portaled dialogs and popovers (z-50).
    return (
      <div
        className="visible fixed z-[31] flex flex-col overflow-clip"
        style={{ top: over.top, left: over.left, width: over.width, height: over.height }}
      >
        {children}
      </div>
    )
  }
  return (
    <div
      className={'absolute flex flex-col overflow-clip ' + (slot ? SLOT[slot] : 'inset-0 invisible')}
      aria-hidden={!slot}
      onMouseDownCapture={onActivate}
      onFocusCapture={onActivate}
    >
      {children}
    </div>
  )
}

export const WorkView = memo(function WorkView({ registerFocus }: { registerFocus: (fn: () => void) => void }) {
  const listOpen = useSessionListStore((s) => s.open)
  const toggleList = useSessionListStore((s) => s.toggle)
  return (
    <div className="flex h-full">
      {!listOpen && (
        <Rail label="Sessions hidden">
          <IconButton onClick={toggleList} label="Show sessions" tooltip={`Show sessions (${SESSION_LIST_SHORTCUT})`}>
            <PanelLeftOpen size={14} />
          </IconButton>
        </Rail>
      )}
      <Group orientation="horizontal" id="work" className="h-full min-w-0 flex-1">
        {listOpen && (
          <>
            <Panel id="session-list" defaultSize="300px" minSize="180px" maxSize="50%">
              <SessionList />
            </Panel>
            <Separator className="w-px bg-subtle hover:w-1 hover:bg-focus" />
          </>
        )}
        <Panel id="work-main" minSize="40%">
          <WorkMain registerFocus={registerFocus} />
        </Panel>
      </Group>
    </div>
  )
})

function WorkMain({ registerFocus }: { registerFocus: (fn: () => void) => void }) {
  const pair = useChatPairStore((s) => s.pair)
  const { halves, focused } = useShownChats()
  const views = useProjectViewsStore((s) => s.views)
  const order = useProjectViewsStore((s) => s.order)
  const listedWorkspaces = useWorkspacesStore((s) => s.workspaces)
  const mainChat = useMainChatStore((s) => s.info)
  const workspaces = useMemo(() => (mainChat ? [...listedWorkspaces, mainChatWorkspace(mainChat)] : listedWorkspaces), [listedWorkspaces, mainChat])
  const observedSessions = useObservedStore((s) => s.sessions)
  const borrow = useDrawerBorrow()

  const split = halves.length === 2
  const slotOf = (half: HalfIndex | null): Slot | null => (half === null ? null : split ? (half === 0 ? 'left' : 'right') : 'full')
  const placeOf = (half: HalfIndex): HalfPlace => ({ half, split, focused: half === focused })
  const workspaceOf = (id: string) => workspaces.find((w) => w.id === id)

  const focusedChat = halves[focused]
  const toolsView = focusedChat?.kind === 'hosted' ? views[focusedChat.workspaceId] : undefined
  const ideOpen = toolsView?.idePanelsOpen ?? false
  const observedHalf = halves.findIndex((h) => h?.kind === 'observed') as HalfIndex | -1
  const observed = observedHalf === -1 ? null : halves[observedHalf]
  const observedWorkspace = observed ? workspaceOf(observed.workspaceId) : undefined
  const focusedSession = focusedChat?.kind === 'hosted' ? toolsView?.claudeSessions.find((c) => c.id === focusedChat.paneId) : undefined
  const toolsWorkspace = toolsView ? workspaceOf(toolsView.projectId) : undefined
  // A file or diff takes the focused chat's place; its header stays.
  const editorHeader = toolsView && focusedSession && toolsWorkspace && (
    <HostedSessionHeader workspace={toolsWorkspace} view={toolsView} session={focusedSession} place={placeOf(focused)} />
  )

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-editor">
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <WorkspaceTools view={toolsView}>
            {toolsView && ideOpen && <EditorTabs view={toolsView} />}
            <div className="relative min-h-0 flex-1">
              {order.map((id) => {
                const view = views[id]
                if (!view) return null
                const workspace = workspaceOf(id)
                return view.claudeSessions.map((c) => {
                  const half = halfShowing(pair, { kind: 'hosted', paneId: c.id })
                  const editing = half === focused && view === toolsView && !chatOnScreen(view)
                  const over = borrow?.paneId === c.id ? borrow.slot : undefined
                  return (
                    <Layer
                      key={c.id}
                      slot={editing ? null : slotOf(half)}
                      onActivate={half === null || over ? undefined : () => focusChatHalf(half)}
                      over={over}
                    >
                      {half !== null && !over && workspace && (
                        <HostedSessionHeader workspace={workspace} view={view} session={c} place={placeOf(half)} />
                      )}
                      <div className="min-h-0 flex-1">
                        <ChatView
                          paneId={c.id}
                          cwd={view.projectPath}
                          model={c.model}
                          effort={c.effort}
                          thinking={c.thinking}
                          resumeSessionId={c.claudeSessionId}
                          permissionMode={c.permissionMode}
                          addDirs={c.addDirs}
                          profileId={workspace?.profileId}
                          registerFocus={half === focused ? registerFocus : undefined}
                          transcriptOnly={!!over}
                        />
                      </div>
                    </Layer>
                  )
                })
              })}
              {order.map((id) => {
                const view = views[id]
                if (!view) return null
                const editing = view === toolsView && view.idePanelsOpen
                const fileShown = editing && view.centerView === 'file'
                const diffShown = editing && view.centerView === 'diff'
                return [
                  <Layer key={`file-${id}`} slot={fileShown ? slotOf(focused) : null}>
                    {fileShown && editorHeader}
                    <div className="min-h-0 flex-1">
                      <EditorPane view={view} />
                    </div>
                  </Layer>,
                  <Layer key={`diff-${id}`} slot={diffShown ? slotOf(focused) : null}>
                    {diffShown && editorHeader}
                    <div className="min-h-0 flex-1">
                      <DiffPane view={view} />
                    </div>
                  </Layer>
                ]
              })}
              {observed?.kind === 'observed' && observedHalf !== -1 && (
                <Layer slot={slotOf(observedHalf)} onActivate={() => focusChatHalf(observedHalf)}>
                  {observedWorkspace && (
                    <ObservedSessionHeader
                      workspace={observedWorkspace}
                      session={observedSessions.find((o) => o.workspaceId === observed.workspaceId && o.sessionId === observed.sessionId)}
                      sessionId={observed.sessionId}
                      place={placeOf(observedHalf)}
                    />
                  )}
                  <div className="min-h-0 flex-1">
                    <ObservedChatView cwd={observedWorkspace?.path} />
                  </div>
                </Layer>
              )}
              {split &&
                halves.map((h, i) => {
                  const half = i as HalfIndex
                  return h ? null : (
                    <Layer key={`empty-${half}`} slot={slotOf(half)} onActivate={() => focusChatHalf(half)}>
                      <EmptyHalfHeader place={placeOf(half)} />
                      <div className="min-h-0 flex-1">
                        <EmptyState>Click a session in the list to open it here.</EmptyState>
                      </div>
                    </Layer>
                  )
                })}
              {!split && !halves[0] && <EmptyState>Pick a session in the list, or start one with + New session (Ctrl+T).</EmptyState>}
            </div>
          </WorkspaceTools>
        </div>
      </div>
    </div>
  )
}

const SIDE_VIEWS: { value: ActivityView; label: string }[] = [
  { value: 'explorer', label: 'Files' },
  { value: 'sourceControl', label: 'Changes' }
]

function SideViewSwitch() {
  const activityView = useProjectViewsStore((s) => s.activityView)
  const setActivityView = useProjectViewsStore((s) => s.setActivityView)
  return <SegmentedControl label="Side panel" options={SIDE_VIEWS} value={activityView} onChange={setActivityView} />
}

/** The open workspace's file tree / source control on the left and its shell drawer below. */
function WorkspaceTools({ view, children }: { view: ProjectView | undefined; children: React.ReactNode }) {
  const activityView = useProjectViewsStore((s) => s.activityView)
  const views = useProjectViewsStore((s) => s.views)
  const order = useProjectViewsStore((s) => s.order)
  const setShellDrawerOpen = useProjectViewsStore((s) => s.setShellDrawerOpen)
  const openFile = useProjectViewsStore((s) => s.openFile)
  const drawerRef = useRef<PanelImperativeHandle>(null)

  const sidePanelOpen = !!view?.idePanelsOpen
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
            {activityView === 'explorer' ? (
              <FileTree
                key={view.projectId}
                cwd={view.projectPath}
                onOpenFile={handleOpenFile}
                activeFilePath={view.activeFilePath}
                heading={<SideViewSwitch />}
              />
            ) : (
              <SourceControlPanel key={view.projectId} cwd={view.projectPath} projectId={view.projectId} heading={<SideViewSwitch />} />
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
                      <Layer key={id} slot={v.projectId === view?.projectId ? 'full' : null}>
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
