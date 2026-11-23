import { useEffect } from 'react'
import type { AppView } from '../state/viewStore'
import { useViewStore } from '../state/viewStore'
import type { ZoomStep } from '../../shared/zoom'
import { beforeFocusedElement, shortcutApplies, shortcutFor, type ShortcutAction } from './shortcutMap'

export const IDE_PANELS_SHORTCUT = 'Ctrl+Shift+E'
export const SESSION_LIST_SHORTCUT = 'Ctrl+B'
export const SHELL_DRAWER_SHORTCUT = 'Ctrl+`'
export const SETTINGS_SHORTCUT = 'Ctrl+,'
export const MEDIA_PANEL_SHORTCUT = 'Ctrl+Shift+M'

export interface ShortcutHandlers {
  switchView?: (view: AppView) => void
  openSettings?: () => void
  newChat?: () => void
  closeActiveChat?: () => void
  focusInput?: () => void
  toggleIdePanels?: () => void
  toggleSessionList?: () => void
  zoom?: (step: ZoomStep) => void
  toggleShellDrawer?: () => void
  selectRow?: (index: number) => void
  loadPastSession?: () => void
  nextWaiting?: () => void
  toggleMediaPanel?: () => void
}

/** Runs the handler for the action; false when no handler is registered for it. */
function run(action: ShortcutAction, handlers: ShortcutHandlers): boolean {
  switch (action.name) {
    case 'switchView':
      handlers.switchView?.(action.view)
      return !!handlers.switchView
    case 'zoom':
      handlers.zoom?.(action.step)
      return !!handlers.zoom
    case 'selectRow':
      handlers.selectRow?.(action.index)
      return !!handlers.selectRow
    default: {
      const handler = handlers[action.name]
      handler?.()
      return !!handler
    }
  }
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const handle = (e: KeyboardEvent, capturing: boolean): boolean => {
      const action = shortcutFor(e)
      if (!action || beforeFocusedElement(action) !== capturing) return false
      const { view, settings } = useViewStore.getState()
      if (!shortcutApplies(action, { view, settingsOpen: settings !== null }) || !run(action, handlers)) return false
      e.preventDefault()
      return true
    }
    // In the capture phase, so a terminal (xterm cancels the keys it sends) never sees the key.
    const onKeyFirst = (e: KeyboardEvent) => {
      if (handle(e, true)) e.stopPropagation()
    }
    const onKey = (e: KeyboardEvent) => void handle(e, false)
    window.addEventListener('keydown', onKeyFirst, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKeyFirst, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [handlers])
}
