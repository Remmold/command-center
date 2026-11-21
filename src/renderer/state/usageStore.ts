import { create } from 'zustand'
import type { ProfileUsage } from '../../shared/types'

interface UsageState {
  /** Keyed by account profile id; the main process's usage service is the source. */
  byProfile: Record<string, ProfileUsage>
  init: () => void
  refresh: (profileId?: string) => void
}

let started = false

function keyed(all: ProfileUsage[]): Record<string, ProfileUsage> {
  return Object.fromEntries(all.map((u) => [u.profileId, u]))
}

export const useUsageStore = create<UsageState>((set) => ({
  byProfile: {},
  init: () => {
    if (started) return
    started = true
    let pushed = false
    window.api.usage.onChanged((all) => {
      pushed = true
      set({ byProfile: keyed(all) })
    })
    void window.api.usage.list().then((all) => {
      if (!pushed) set({ byProfile: keyed(all) })
    })
  },
  refresh: (profileId) => window.api.usage.refresh(profileId)
}))
