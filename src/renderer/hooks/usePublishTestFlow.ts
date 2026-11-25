import { useEffect, useMemo } from 'react'
import { findTestFlows, repoNameFor, type TestFlowFocus } from '../../shared/testFlow'
import type { ChatItem } from '../components/chat/types'
import { useChatItemsStore } from '../state/chatItemsStore'
import { useChatPairStore } from '../state/chatPairStore'
import { useObservedStore } from '../state/observedStore'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { resolveChat } from '../state/sessionNavigation'
import { useTestFlowsFolder } from '../state/testFlowStore'
import { useViewStore } from '../state/viewStore'
import { useWorkspacesStore } from '../state/workspacesStore'

const NO_ITEMS: ChatItem[] = []

interface FocusedSession {
  items: readonly ChatItem[]
  cwd: string | undefined
  title: string
}

function useFocusedSession(): FocusedSession | null {
  const pair = useChatPairStore((s) => s.pair)
  const views = useProjectViewsStore((s) => s.views)
  const target = resolveChat(pair.halves[pair.focused], views)
  const paneId = target?.kind === 'hosted' ? target.paneId : null
  const hostedItems = useChatItemsStore((s) => (paneId ? s.items[paneId] ?? NO_ITEMS : NO_ITEMS))
  const observedItems = useObservedStore((s) => s.items)
  const viewing = useObservedStore((s) => s.viewing)
  const observedSessions = useObservedStore((s) => s.sessions)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  if (!target) return null
  if (target.kind === 'hosted') {
    const view = views[target.workspaceId]
    const session = view?.claudeSessions.find((c) => c.id === target.paneId)
    return view && session ? { items: hostedItems, cwd: view.projectPath, title: session.title } : null
  }
  if (viewing?.workspaceId !== target.workspaceId || viewing.sessionId !== target.sessionId) return null
  const observed = observedSessions.find((o) => o.workspaceId === target.workspaceId && o.sessionId === target.sessionId)
  return {
    items: observedItems,
    cwd: workspaces.find((w) => w.id === target.workspaceId)?.path,
    title: observed?.title ?? target.sessionId.slice(0, 8)
  }
}

/**
 * Tells main the test flow of the session focused in Work, for the pop-out window. Nothing is sent while Work is off
 * screen, so the pop-out keeps the last session's.
 */
export function usePublishTestFlow(): void {
  const onScreen = useViewStore((s) => s.view === 'work' && s.settings === null)
  const folder = useTestFlowsFolder()
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const session = useFocusedSession()
  const items = session?.items ?? NO_ITEMS
  const cwd = session?.cwd
  const title = session?.title
  const repoName = useMemo(() => repoNameFor(workspaces, cwd), [workspaces, cwd])
  const picks = useMemo(() => (folder === null ? [] : findTestFlows({ items, folder, repoName })), [items, folder, repoName])
  const focus = useMemo(
    (): TestFlowFocus | null => (folder === null || title === undefined ? null : { picks, folder, repoName, title }),
    [picks, folder, repoName, title]
  )
  // Every streamed item rebuilds the picks; only a change in what the pop-out would show is sent.
  const key = focus ? JSON.stringify(focus) : null
  useEffect(() => {
    if (onScreen && key) window.api.testFlow.publish(JSON.parse(key) as TestFlowFocus)
  }, [onScreen, key])
}
