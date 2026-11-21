import { useEffect } from 'react'
import type { AppView } from '../state/viewStore'

export const IDE_PANELS_SHORTCUT = 'Ctrl+B'
export const SHELL_DRAWER_SHORTCUT = 'Ctrl+`'

export interface ShortcutHandlers {
  switchView?: (view: AppView) => void
  newChat?: () => void
  closeActiveChat?: () => void
  focusInput?: () => void
  toggleIdePanels?: () => void
  toggleShellDrawer?: () => void
  switchTabIndex?: (index: number) => void
  loadPastSession?: () => void
  sendUsage?: () => void
  nextWaiting?: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1]
      const mod = e.ctrlKey || e.metaKey

      // AltGr arrives as Ctrl+Alt and types characters on some layouts, so only a bare Alt counts.
      if (digit && e.altKey && !mod && handlers.switchTabIndex) {
        e.preventDefault()
        handlers.switchTabIndex(Number(digit) - 1)
        return
      }
      if (!mod) return

      if (digit && !e.altKey && handlers.switchView && (digit === '1' || digit === '2')) {
        e.preventDefault()
        handlers.switchView(digit === '1' ? 'sessions' : 'board')
        return
      }

      if (e.key === 't' && handlers.newChat) {
        e.preventDefault()
        handlers.newChat()
        return
      }
      if (e.key === 'w' && handlers.closeActiveChat) {
        e.preventDefault()
        handlers.closeActiveChat()
        return
      }
      if (e.key === 'k' && handlers.focusInput) {
        e.preventDefault()
        handlers.focusInput()
        return
      }
      if (e.key === 'b' && handlers.toggleIdePanels) {
        e.preventDefault()
        handlers.toggleIdePanels()
        return
      }
      // By position: on Nordic and German layouts the key left of 1 doesn't type a backtick.
      if (e.code === 'Backquote' && handlers.toggleShellDrawer) {
        e.preventDefault()
        handlers.toggleShellDrawer()
        return
      }
      if (e.key === 'j' && handlers.nextWaiting) {
        e.preventDefault()
        handlers.nextWaiting()
        return
      }
      if (e.key === 'l' && handlers.loadPastSession) {
        e.preventDefault()
        handlers.loadPastSession()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
