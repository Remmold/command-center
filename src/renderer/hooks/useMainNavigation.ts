import { useEffect } from 'react'
import { parseView } from '../../shared/views'
import { useViewStore } from '../state/viewStore'
import { openSession } from '../state/sessionNavigation'

export function useMainNavigation(): void {
  useEffect(() => {
    const unsubs = [
      window.api.navigation.onShowView((view) => useViewStore.getState().setView(parseView(view))),
      window.api.navigation.onOpenSession((paneId) => {
        if (!openSession(paneId)) useViewStore.getState().setView('work')
      })
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [])
}
