import { useCallback, useEffect, useRef } from 'react'
import { TitleBar } from './components/TitleBar'
import { DashboardView } from './components/DashboardView'
import { SettingsPage } from './components/settings/SettingsPage'
import { WorkView } from './components/work/WorkView'
import { useProjectViewsStore } from './state/projectViewsStore'
import { useAppsStore } from './state/appsStore'
import { useUsageStore, type RateLimitInfo } from './state/usageStore'
import type { RawModelUsage } from './state/usageModel'
import { usePermissionsStore } from './state/permissionsStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useViewStore } from './state/viewStore'
import { BoardView } from './components/board/BoardView'
import { useSessionStatusStore } from './state/sessionStatusStore'
import { jumpToNextWaiting, openSession, paneOnScreen } from './state/sessionNavigation'
import { openRowAt } from './state/workSessions'
import { useWorkspacesStore } from './state/workspacesStore'
import { useProfilesStore } from './state/profilesStore'
import { useReportScreenFocus } from './hooks/useReportScreenFocus'
import { useMainNavigation } from './hooks/useMainNavigation'
import { useNotificationIcons } from './hooks/useNotificationIcons'
import type { ClaudeResultEvent } from '../shared/types'
import { useObservedStore } from './state/observedStore'

interface RawResultUsage {
  modelUsage?: Record<string, RawModelUsage>
}

export function App() {
  const recordResult = useUsageStore((s) => s.recordResult)
  const setRateLimit = useUsageStore((s) => s.setRateLimit)
  const addPermissionRequest = usePermissionsStore((s) => s.addRequest)
  const appView = useViewStore((s) => s.view)
  const settingsSection = useViewStore((s) => s.settings)
  const initApps = useAppsStore((s) => s.init)
  const initSessionStatus = useSessionStatusStore((s) => s.init)
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
  }, [initSessionStatus])

  useEffect(() => {
    initObserved()
  }, [initObserved])

  useReportScreenFocus()
  useMainNavigation()
  useNotificationIcons()

  useEffect(() => {
    const unsub = window.api.permission.onRequest((request) => {
      addPermissionRequest(request)
    })
    return unsub
  }, [addPermissionRequest])

  useEffect(() => {
    const unsub = window.api.claude.onEvent(({ paneId, profileId, event }) => {
      const type = (event as { type?: string })?.type
      if (type === 'result') {
        const re = event as ClaudeResultEvent
        const modelUsage = (re as unknown as RawResultUsage).modelUsage
        recordResult(
          profileId,
          paneId,
          typeof re.total_cost_usd === 'number' ? re.total_cost_usd : 0,
          re.duration_ms ?? 0,
          modelUsage
        )
        return
      }
      if (type === 'rate_limit_event') {
        const info = (event as { rate_limit_info?: RateLimitInfo }).rate_limit_info
        if (info) setRateLimit(profileId, info)
      }
    })
    return unsub
  }, [recordResult, setRateLimit])

  useKeyboardShortcuts({
    switchView: (next) => useViewStore.getState().setView(next),
    openSettings: () => useViewStore.getState().openSettings(),
    nextWaiting: jumpToNextWaiting,
    newChat: () => {
      const projectId = openHostedWorkspace()
      if (!projectId) return
      const created = useProjectViewsStore.getState().addClaudeSession(projectId)
      if (created) openSession(created.id)
    },
    closeActiveChat: () => {
      const target = paneOnScreen()
      const projectId = useProjectViewsStore.getState().activeProjectId
      if (target && projectId) useProjectViewsStore.getState().closeClaudeSession(projectId, target)
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
    selectRow: openRowAt
  })

  return (
    <div className="relative flex h-full flex-col">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        {appView === 'dashboard' && (
          <div className="absolute inset-0 z-30">
            <DashboardView />
          </div>
        )}
        {appView === 'board' && (
          <div className="absolute inset-0 z-30">
            <BoardView />
          </div>
        )}
        <div
          className={'min-h-0 min-w-0 flex-1 ' + (appView === 'work' ? '' : 'invisible')}
          aria-hidden={appView !== 'work'}
        >
          <WorkView registerFocus={registerFocus} />
        </div>
      </div>
      {settingsSection && (
        <div className="absolute inset-0 z-40">
          <SettingsPage section={settingsSection} />
        </div>
      )}
    </div>
  )
}

/** The workspace of the hosted session open in Work; none while an observed session is open. */
function openHostedWorkspace(): string | null {
  if (useObservedStore.getState().viewing) return null
  const { activeProjectId, views } = useProjectViewsStore.getState()
  return activeProjectId && views[activeProjectId]?.activeClaudeSessionId ? activeProjectId : null
}
