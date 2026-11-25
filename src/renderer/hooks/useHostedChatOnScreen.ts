import { useSyncExternalStore } from 'react'
import { useChatPairStore } from '../state/chatPairStore'
import { useChatDrawerStore } from '../state/chatDrawer'
import { hostedChatOnScreen } from '../state/chatsOnScreen'
import { chatOnScreen } from '../state/projectViewLayout'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useViewStore } from '../state/viewStore'

const subscribeVisibility = (onChange: () => void): (() => void) => {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

const windowVisible = (): boolean => document.visibilityState === 'visible'

/** Selects only booleans and the pair, so unrelated workspace changes don't re-render the chat. */
export function useHostedChatOnScreen(paneId: string): boolean {
  const view = useViewStore((s) => s.view)
  const settingsOpen = useViewStore((s) => s.settings !== null)
  const pair = useChatPairStore((s) => s.pair)
  const chatTabShown = useProjectViewsStore((s) => {
    const own = Object.values(s.views).find((v) => v.claudeSessions.some((c) => c.id === paneId))
    return own !== undefined && chatOnScreen(own)
  })
  const drawerPaneId = useChatDrawerStore((s) => (s.paneId === paneId ? paneId : null))
  const visible = useSyncExternalStore(subscribeVisibility, windowVisible)
  return hostedChatOnScreen(paneId, { view, settingsOpen, windowVisible: visible, pair, chatTabShown, drawerPaneId })
}
