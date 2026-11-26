import { useMemo } from 'react'
import { useBoardStore } from './boardStore'
import { useChatItemsStore } from './chatItemsStore'
import { dashboard, type Dashboard, type ObservedTail } from './dashboard'
import { useObservedStore } from './observedStore'
import { useProfilesStore } from './profilesStore'
import { useUsageStore } from './usageStore'
import { useSessionSources } from './workSessions'
import { useAccounts } from './useAccounts'
import { useChatDrawerStore } from './chatDrawer'

function useObservedTail(): ObservedTail | null {
  const viewing = useObservedStore((s) => s.viewing)
  const items = useObservedStore((s) => s.items)
  return useMemo(() => (viewing ? { ...viewing, items } : null), [viewing, items])
}

export function useDashboard(now: number): Dashboard {
  const sources = useSessionSources(true)
  const board = useBoardStore((s) => s.model)
  const profiles = useProfilesStore((s) => s.profiles)
  const usage = useUsageStore((s) => s.byProfile)
  const chatItems = useChatItemsStore((s) => s.items)
  const observedTail = useObservedTail()
  const accounts = useAccounts()
  const drawerPaneId = useChatDrawerStore((s) => s.paneId)
  return useMemo(
    () =>
      dashboard({
        ...sources,
        board,
        profiles,
        usage,
        chatItems,
        observedTail,
        now,
        accounts,
        drawerPaneId
      }),
    [sources, board, profiles, usage, chatItems, observedTail, now, accounts, drawerPaneId]
  )
}
