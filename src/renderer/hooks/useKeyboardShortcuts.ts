import { useEffect } from 'react'
import type { AppView } from '../state/viewStore'

export interface ShortcutHandlers {
  switchView?: (view: AppView) => void
  newChat?: () => void
  closeActiveChat?: () => void
  focusInput?: () => void
  toggleBottomPanel?: () => void
  switchTabIndex?: (index: number) => void
  loadPastSession?: () => void
  sendUsage?: () => void
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
      if (e.key === 'b' && handlers.toggleBottomPanel) {
        e.preventDefault()
        handlers.toggleBottomPanel()
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
