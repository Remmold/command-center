import { useCallback, useEffect, useRef } from 'react'
import { TitleBar } from './components/TitleBar'
import { DashboardView } from './components/dashboard/DashboardView'
import { SettingsPage } from './components/settings/SettingsPage'
import { WorkView } from './components/work/WorkView'
import { useProjectViewsStore } from './state/projectViewsStore'
import { useAppsStore } from './state/appsStore'
import { useUsageStore } from './state/usageStore'
import { useApprovalsStore } from './state/approvalsStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useViewStore } from './state/viewStore'
import { BoardView } from './components/board/BoardView'
import { ContextView } from './components/context/ContextView'
import { useSessionStatusStore } from './state/sessionStatusStore'
import { useBackgroundProcessesStore } from './state/backgroundProcessesStore'
import { useSessionInitStore } from './state/sessionInitStore'
import { useRemoteControlStore } from './state/remoteControlStore'
import { useModelStore } from './state/modelStore'
import { closeSession, focusedTarget, initChatPair, paneOnScreen } from './state/sessionNavigation'
import { pickPastSession, pickProject } from './state/launcherStore'
import { SessionLauncher } from './components/work/SessionLauncher'
import { Toasts } from './components/ui/Toasts'
import { ApprovalInbox } from './components/inbox/ApprovalInbox'
import { useApprovalInboxStore } from './state/approvalInboxStore'
import { jumpToNextWaiting, openRowAt } from './state/workSessions'
import { useWorkspacesStore } from './state/workspacesStore'
import { useProfilesStore } from './state/profilesStore'
import { useVsCodeMatchStore } from './state/vscodeMatchStore'
import { useReportScreenFocus } from './hooks/useReportScreenFocus'
import { useMainNavigation } from './hooks/useMainNavigation'
import { useNotificationIcons } from './hooks/useNotificationIcons'
import { usePublishTestFlow } from './hooks/usePublishTestFlow'
import { useObservedStore } from './state/observedStore'
import { useUpdateStore } from './state/updateStore'
import { startRestore } from './state/restoreStore'
import { useSessionListStore } from './state/sessionListStore'
import { mediaKeyOf, useChatMediaStore } from './state/chatMediaStore'
import { useZoomStore } from './state/zoomStore'
import { useSidebarGroupsStore } from './state/sidebarGroupsStore'

export function App() {
  const initUsage = useUsageStore((s) => s.init)
  const initApprovals = useApprovalsStore((s) => s.init)
  const appView = useViewStore((s) => s.view)
  const settingsSection = useViewStore((s) => s.settings)
  const initApps = useAppsStore((s) => s.init)
  const initSessionStatus = useSessionStatusStore((s) => s.init)
  const initSessionInit = useSessionInitStore((s) => s.init)
  const initModels = useModelStore((s) => s.init)
  const initObserved = useObservedStore((s) => s.init)
  const loadWorkspaces = useWorkspacesStore((s) => s.load)
  const loadProfiles = useProfilesStore((s) => s.load)

  const focusInputRef = useRef<() => void>()
  const registerFocus = useCallback((fn: () => void) => {
    focusInputRef.current = fn
  }, [])

  useEffect(() => {
    void loadWorkspaces()
    void loadProfiles()
  }, [loadWorkspaces, loadProfiles])

  useEffect(() => {
    initApps()
  }, [initApps])

  useEffect(() => {
    initSessionStatus()
    initSessionInit()
    initModels()
    useBackgroundProcessesStore.getState().init()
    useRemoteControlStore.getState().init()
    useUpdateStore.getState().init()
    useZoomStore.getState().init()
    useSidebarGroupsStore.getState().init()
    void useVsCodeMatchStore.getState().load()
    startRestore()
  }, [initSessionStatus, initSessionInit, initModels])

  useEffect(() => {
    initObserved()
    initChatPair()
  }, [initObserved])

  useReportScreenFocus()
  useMainNavigation()
  useNotificationIcons()
  usePublishTestFlow()

  useEffect(() => {
    initApprovals()
  }, [initApprovals])

  useEffect(() => {
    initUsage()
  }, [initUsage])

  useKeyboardShortcuts({
    switchView: (next) => useViewStore.getState().setView(next),
    openSettings: () => useViewStore.getState().openSettings(),
    nextWaiting: jumpToNextWaiting,
    openApprovals: () => useApprovalInboxStore.getState().toggle(),
    newChat: pickProject,
    loadPastSession: () => pickPastSession(),
    closeActiveChat: () => {
      const target = paneOnScreen()
      if (target) closeSession(target)
    },
    focusInput: () => focusInputRef.current?.(),
    toggleIdePanels: () => {
      const projectId = openHostedWorkspace()
      if (projectId) useProjectViewsStore.getState().toggleIdePanels(projectId)
    },
    toggleShellDrawer: () => {
      const projectId = openHostedWorkspace()
      if (projectId) useProjectViewsStore.getState().toggleShellDrawer(projectId)
    },
    toggleSessionList: () => useSessionListStore.getState().toggle(),
    toggleMediaTab: () => {
      const target = focusedTarget()
      if (target) useChatMediaStore.getState().toggleTab(mediaKeyOf(target))
    },
    zoom: (step) => useZoomStore.getState().step(step),
    selectRow: openRowAt
  })

  return (
    <div className="relative flex h-full flex-col">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        {appView === 'dashboard' && (
          <div data-testid="view-dashboard" className="absolute inset-0 z-30">
            <DashboardView />
          </div>
        )}
        {appView === 'board' && (
          <div data-testid="view-board" className="absolute inset-0 z-30">
            <BoardView />
          </div>
        )}
        {appView === 'context' && (
          <div data-testid="view-context" className="absolute inset-0 z-30">
            <ContextView />
          </div>
        )}
        <div
          data-testid="view-work"
          className={'min-h-0 min-w-0 flex-1 ' + (appView === 'work' ? '' : 'invisible')}
          aria-hidden={appView !== 'work'}
        >
          <WorkView registerFocus={registerFocus} />
        </div>
      </div>
      <SessionLauncher />
      <ApprovalInbox />
      <Toasts />
      {settingsSection && (
        <div className="absolute inset-0 z-40">
          <SettingsPage section={settingsSection} />
        </div>
      )}
    </div>
  )
}

/** The workspace of the hosted session in the focused half; none while that half shows an observed session. */
function openHostedWorkspace(): string | null {
  const target = focusedTarget()
  return target?.kind === 'hosted' ? target.workspaceId : null
}
