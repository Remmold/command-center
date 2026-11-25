import { useEffect } from 'react'
import { parseView } from '../../shared/views'
import { useViewStore } from '../state/viewStore'
import { openNotifiedSession } from '../state/sessionNavigation'
import { useApprovalInboxStore } from '../state/approvalInboxStore'

export function useMainNavigation(): void {
  useEffect(() => {
    const unsubs = [
      window.api.navigation.onShowView((view) => useViewStore.getState().setView(parseView(view))),
      window.api.navigation.onOpenSession((paneId) => {
        if (!openNotifiedSession(paneId)) useViewStore.getState().setView('work')
      }),
      window.api.navigation.onOpenApprovals((paneId) => useApprovalInboxStore.getState().show(paneId))
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [])
}
