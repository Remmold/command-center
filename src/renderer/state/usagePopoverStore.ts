import { create } from 'zustand'

interface UsagePopoverState {
  /** Bumped to open the Account & usage popover of the profile on screen. */
  nonce: number
  open: () => void
}

export const useUsagePopoverStore = create<UsagePopoverState>((set) => ({
  nonce: 0,
  open: () => set((s) => ({ nonce: s.nonce + 1 }))
}))
