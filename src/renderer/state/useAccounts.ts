import { useMemo, useRef } from 'react'
import { accountList, type Account } from './accounts'
import { useProfilesStore } from './profilesStore'
import { useSessionInitStore } from './sessionInitStore'
import { useUsageStore } from './usageStore'

/** Every account profile, named by profile and plan, in Settings order; the same array until a name or plan changes, as usage refreshes often. */
export function useAccounts(): Account[] {
  const profiles = useProfilesStore((s) => s.profiles)
  const usage = useUsageStore((s) => s.byProfile)
  const initAccounts = useSessionInitStore((s) => s.accountByProfile)
  const kept = useRef<{ key: string; list: Account[] } | null>(null)
  return useMemo(() => {
    const list = accountList({ profiles, usage, initAccounts })
    const key = JSON.stringify(list)
    if (kept.current?.key !== key) kept.current = { key, list }
    return kept.current.list
  }, [profiles, usage, initAccounts])
}

export function currentAccounts(): Account[] {
  return accountList({
    profiles: useProfilesStore.getState().profiles,
    usage: useUsageStore.getState().byProfile,
    initAccounts: useSessionInitStore.getState().accountByProfile
  })
}
