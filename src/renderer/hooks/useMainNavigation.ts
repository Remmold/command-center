import { useEffect } from 'react'
import { useViewStore } from '../state/viewStore'
import { openSession } from '../state/sessionNavigation'

export function useMainNavigation(): void {
  useEffect(() => {
    const unsubs = [
      window.api.navigation.onShowView((view) => useViewStore.getState().setView(view)),
      window.api.navigation.onOpenSession((paneId) => {
        if (!openSession(paneId)) useViewStore.getState().setView('sessions')
      })
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [])
}
