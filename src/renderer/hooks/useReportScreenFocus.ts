import { useEffect } from 'react'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useViewStore } from '../state/viewStore'
import { paneOnScreen } from '../state/sessionNavigation'
import { useObservedStore } from '../state/observedStore'
import { useChatDrawerStore } from '../state/chatDrawer'

export function useReportScreenFocus(): void {
  useEffect(() => {
    let last = ''
    const report = () => {
      const focus = { paneId: paneOnScreen(), windowVisible: document.visibilityState === 'visible' }
      const key = `${focus.paneId}|${focus.windowVisible}`
      if (key === last) return
      last = key
      window.api.sessionStatus.reportScreenFocus(focus)
    }
    report()
    const unsubs = [
      useViewStore.subscribe(report),
      useProjectViewsStore.subscribe(report),
      useObservedStore.subscribe(report),
      useChatDrawerStore.subscribe(report)
    ]
    document.addEventListener('visibilitychange', report)
    return () => {
      for (const u of unsubs) u()
      document.removeEventListener('visibilitychange', report)
    }
  }, [])
}
