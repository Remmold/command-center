import { useMemo } from 'react'
import { usageEntries, type UsageEntry } from './usageModel'
import { useProfilesStore } from './profilesStore'
import { useUsageStore } from './usageStore'

export function useUsageEntries(activeProfileId: string | null, now: number): UsageEntry[] {
  const profiles = useProfilesStore((s) => s.profiles)
  const usage = useUsageStore((s) => s.byProfile)
  return useMemo(() => usageEntries({ profiles, usage, activeProfileId, now }), [profiles, usage, activeProfileId, now])
}
