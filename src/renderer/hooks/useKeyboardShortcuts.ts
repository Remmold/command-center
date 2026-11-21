import { useEffect } from 'react'

export interface ShortcutHandlers {
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
      const target = e.target as HTMLElement | null
      const inEditable =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT'
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

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
      // Ctrl+1..9 switch tabs
      const digit = parseInt(e.key, 10)
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 9 && handlers.switchTabIndex) {
        // Don't override Ctrl+Number inside editable fields (browser default)
        if (inEditable && !e.altKey) return
        e.preventDefault()
        handlers.switchTabIndex(digit - 1)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
