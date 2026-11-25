import type { AppView } from '../../shared/views'
import { halfShowing, type ChatPair } from './chatPair'

export interface Screen {
  view: AppView
  settingsOpen: boolean
  windowVisible: boolean
  pair: ChatPair
  /** The chat's workspace shows its chat rather than a file or diff (`chatOnScreen`). */
  chatTabShown: boolean
  /** The chat is the Dashboard's chat drawer's session. */
  inDrawer: boolean
}

/**
 * A hosted chat is on screen while Work shows it in a half and the focused half's file or diff does not cover it,
 * or while the Dashboard shows it in the chat drawer.
 */
export function hostedChatOnScreen(paneId: string, screen: Screen): boolean {
  if (screen.settingsOpen || !screen.windowVisible) return false
  if (screen.view === 'dashboard') return screen.inDrawer
  if (screen.view !== 'work') return false
  const half = halfShowing(screen.pair, { kind: 'hosted', paneId })
  if (half === null) return false
  return half !== screen.pair.focused || screen.chatTabShown
}
