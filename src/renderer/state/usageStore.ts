import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  USAGE_VERSION,
  dateKey,
  emptyTallies,
  migrateUsage,
  recordResult,
  type RateLimitInfo,
  type RawModelUsage,
  type UsageTallies
} from './usageModel'

export type { RateLimitInfo } from './usageModel'
export { totalTokens } from './usageModel'

interface UsageState extends UsageTallies {
  /** Latest window per account profile id; volatile. */
  rateLimits: Record<string, RateLimitInfo>

  recordResult: (
    profileId: string,
    paneId: string,
    costUsd: number,
    durationMs: number,
    modelUsage?: Record<string, RawModelUsage>
  ) => void
  setRateLimit: (profileId: string, info: RateLimitInfo) => void
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set) => ({
      ...emptyTallies(),
      rateLimits: {},

      recordResult: (profileId, paneId, costUsd, durationMs, modelUsage) =>
        set((s) => recordResult(s, profileId, paneId, { costUsd, durationMs, modelUsage, today: dateKey() })),

      setRateLimit: (profileId, info) => set((s) => ({ rateLimits: { ...s.rateLimits, [profileId]: info } }))
    }),
    {
      name: 'command-center.usage',
      storage: createJSONStorage(() => localStorage),
      version: USAGE_VERSION,
      migrate: (persisted, version) => migrateUsage(persisted, version) as UsageState,
      partialize: (state): UsageTallies => ({ sessions: state.sessions, profiles: state.profiles })
    }
  )
)

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function formatResetTime(unixSeconds: number): string {
  const ms = unixSeconds * 1000
  const diff = ms - Date.now()
  if (diff <= 0) return 'now'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
