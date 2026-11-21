import { useEffect, useRef } from 'react'
import { ActivityBar } from './components/ActivityBar'
import { ProjectTabs } from './components/ProjectTabs'
import { Sidebar } from './components/Sidebar'
import { ProjectView } from './components/ProjectView'
import { AppsDashboard } from './components/AppsDashboard'
import { useProjectViewsStore } from './state/projectViewsStore'
import { useAppsStore } from './state/appsStore'
import { useUsageStore, type RateLimitInfo } from './state/usageStore'
import type { RawModelUsage } from './state/usageModel'
import { usePermissionsStore } from './state/permissionsStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useViewStore } from './state/viewStore'
import { BoardView } from './components/board/BoardView'
import { useSessionStatusStore } from './state/sessionStatusStore'
import { jumpToNextWaiting } from './state/sessionNavigation'
import { useReportScreenFocus } from './hooks/useReportScreenFocus'
import { useMainNavigation } from './hooks/useMainNavigation'
import { useNotificationIcons } from './hooks/useNotificationIcons'
import type { ClaudeResultEvent } from '../shared/types'
import { useObservedStore } from './state/observedStore'
import { ObservedChatView } from './components/chat/ObservedChatView'

interface RawResultUsage {
  modelUsage?: Record<string, RawModelUsage>
}

export function App() {
  const order = useProjectViewsStore((s) => s.order)
  const views = useProjectViewsStore((s) => s.views)
  const activeProjectId = useProjectViewsStore((s) => s.activeProjectId)
  const idePanelsOpen = useProjectViewsStore((s) =>
    s.activeProjectId ? (s.views[s.activeProjectId]?.idePanelsOpen ?? false) : false
  )
  const recordResult = useUsageStore((s) => s.recordResult)
  const setRateLimit = useUsageStore((s) => s.setRateLimit)
  const addPermissionRequest = usePermissionsStore((s) => s.addRequest)
  const showApps = useAppsStore((s) => s.showApps)
  const appView = useViewStore((s) => s.view)
  const initApps = useAppsStore((s) => s.init)
  const initSessionStatus = useSessionStatusStore((s) => s.init)
  const initObserved = useObservedStore((s) => s.init)
  const observedOpen = useObservedStore((s) => s.viewing !== null && s.viewing.workspaceId === activeProjectId)

  const focusInputRef = useRef<() => void>()

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
    nextWaiting: jumpToNextWaiting,
    newChat: () => {
      const projectId = useProjectViewsStore.getState().activeProjectId
      if (!projectId) return
      useProjectViewsStore.getState().addClaudeSession(projectId)
      useProjectViewsStore.getState().setCenterView(projectId, 'chat')
    },
    closeActiveChat: () => {
      const state = useProjectViewsStore.getState()
      const projectId = state.activeProjectId
      if (!projectId) return
      const view = state.views[projectId]
      if (!view?.activeClaudeSessionId) return
      state.closeClaudeSession(projectId, view.activeClaudeSessionId)
    },
    focusInput: () => focusInputRef.current?.(),
    toggleIdePanels: () => {
      const projectId = useProjectViewsStore.getState().activeProjectId
      if (projectId) useProjectViewsStore.getState().toggleIdePanels(projectId)
    },
    toggleShellDrawer: () => {
      const projectId = useProjectViewsStore.getState().activeProjectId
      if (projectId) useProjectViewsStore.getState().toggleShellDrawer(projectId)
    },
    switchTabIndex: (i) => {
      const state = useProjectViewsStore.getState()
      const projectId = state.activeProjectId
      if (!projectId) return
      const view = state.views[projectId]
      const target = view?.claudeSessions[i]
      if (target) state.setActiveClaudeSession(projectId, target.id)
    }
  })

  return (
    <div className="flex h-full flex-col">
      <ProjectTabs />
      <div className="relative flex min-h-0 flex-1">
        {appView === 'board' && (
          <div className="absolute inset-0 z-30">
            <BoardView />
          </div>
        )}
        <div
          className={'flex min-h-0 min-w-0 flex-1 ' + (appView === 'board' ? 'invisible' : '')}
          aria-hidden={appView === 'board'}
        >
          <Sidebar />
          {idePanelsOpen && <ActivityBar />}
          <div className="relative min-w-0 flex-1">
            {showApps && (
              <div className="absolute inset-0 z-20">
                <AppsDashboard />
              </div>
            )}
            {observedOpen && (
              <div className="absolute inset-0 z-10">
                <ObservedChatView />
              </div>
            )}
            {order.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                pick a workspace in the sidebar, or click + to add one
              </div>
            )}
            {order.map((projectId) => {
              const view = views[projectId]
              if (!view) return null
              const active = projectId === activeProjectId
              return (
                <div
                  key={projectId}
                  className={'absolute inset-0 ' + (active ? '' : 'invisible')}
                  aria-hidden={!active}
                >
                  <ProjectView
                    view={view}
                    registerFocus={
                      active
                        ? (fn) => {
                            focusInputRef.current = fn
                          }
                        : undefined
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
