import { create } from 'zustand'

interface AccountSwitchState {
  /** Pane id → the account it moves to; the chat restarts on it once its turn is over. */
  pending: Record<string, string>
  request: (paneId: string, accountLabel: string) => void
  clear: (paneId: string) => void
}

export const useAccountSwitchStore = create<AccountSwitchState>((set) => ({
  pending: {},
  request: (paneId, accountLabel) => set((s) => ({ pending: { ...s.pending, [paneId]: accountLabel } })),
  clear: (paneId) =>
    set((s) => {
      const { [paneId]: _gone, ...rest } = s.pending
      return { pending: rest }
    })
}))
