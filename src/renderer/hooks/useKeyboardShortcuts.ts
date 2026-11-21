import { useEffect } from 'react'
import type { AppView } from '../state/viewStore'
import { shortcutFor, type ShortcutAction } from './shortcutMap'

export const IDE_PANELS_SHORTCUT = 'Ctrl+B'
export const SHELL_DRAWER_SHORTCUT = 'Ctrl+`'
export const SETTINGS_SHORTCUT = 'Ctrl+,'

export interface ShortcutHandlers {
  switchView?: (view: AppView) => void
  openSettings?: () => void
  newChat?: () => void
  closeActiveChat?: () => void
  focusInput?: () => void
  toggleIdePanels?: () => void
  toggleShellDrawer?: () => void
  switchTabIndex?: (index: number) => void
  loadPastSession?: () => void
  nextWaiting?: () => void
}

/** Runs the handler for the action; false when no handler is registered for it. */
function run(action: ShortcutAction, handlers: ShortcutHandlers): boolean {
  switch (action.name) {
    case 'switchView':
      handlers.switchView?.(action.view)
      return !!handlers.switchView
    case 'switchTabIndex':
      handlers.switchTabIndex?.(action.index)
      return !!handlers.switchTabIndex
    default: {
      const handler = handlers[action.name]
      handler?.()
      return !!handler
    }
  }
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e)
      if (action && run(action, handlers)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
