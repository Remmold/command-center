import { useEffect } from 'react'
import type { AppView } from '../state/viewStore'
import { useViewStore } from '../state/viewStore'
import type { ZoomStep } from '../../shared/zoom'
import { shortcutApplies, shortcutFor, type ShortcutAction } from './shortcutMap'

export const IDE_PANELS_SHORTCUT = 'Ctrl+Shift+E'
export const SESSION_LIST_SHORTCUT = 'Ctrl+B'
export const SHELL_DRAWER_SHORTCUT = 'Ctrl+`'
export const SETTINGS_SHORTCUT = 'Ctrl+,'

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
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e)
      if (!action || action.name === 'zoom') return
      const { view, settings } = useViewStore.getState()
      if (shortcutApplies(action, { view, settingsOpen: settings !== null }) && run(action, handlers)) e.preventDefault()
    }
    // Zoom runs before any focused element sees the key, so a terminal or the prompt box can't take it.
    const onZoomKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e)
      if (action?.name !== 'zoom' || !run(action, handlers)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onZoomKey, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onZoomKey, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [handlers])
}
