import { useMemo } from 'react'
import { useBoardStore } from './boardStore'
import { useChatItemsStore } from './chatItemsStore'
import { dashboard, type Dashboard, type ObservedTail } from './dashboard'
import { useObservedStore } from './observedStore'
import { useProfilesStore } from './profilesStore'
import { useUsageStore } from './usageStore'
import { useSessionSources } from './workSessions'

function useObservedTail(): ObservedTail | null {
  const viewing = useObservedStore((s) => s.viewing)
  const items = useObservedStore((s) => s.items)
  return useMemo(() => (viewing ? { ...viewing, items } : null), [viewing, items])
}

export function useDashboard(now: number): Dashboard {
  const sources = useSessionSources()
  const board = useBoardStore((s) => s.model)
  const profiles = useProfilesStore((s) => s.profiles)
  const sessionTallies = useUsageStore((s) => s.sessions)
  const profileTallies = useUsageStore((s) => s.profiles)
  const rateLimits = useUsageStore((s) => s.rateLimits)
  const chatItems = useChatItemsStore((s) => s.items)
  const observedTail = useObservedTail()
  return useMemo(
    () =>
      dashboard({
        ...sources,
        board,
        profiles,
        tallies: { sessions: sessionTallies, profiles: profileTallies },
        rateLimits,
        chatItems,
        observedTail,
        now
      }),
    [sources, board, profiles, sessionTallies, profileTallies, rateLimits, chatItems, observedTail, now]
  )
}
