import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const ACCOUNT_COLORS = ['blue', 'orange', 'purple', 'teal', 'green', 'red'] as const
export type AccountColor = (typeof ACCOUNT_COLORS)[number]

const isColor = (c: string | undefined): c is AccountColor => (ACCOUNT_COLORS as readonly string[]).includes(c ?? '')

/** The picked colour, else the palette in Settings order; null for no account. */
export function accountColor(profileId: string | null, order: readonly string[], picked: Readonly<Record<string, string>>): AccountColor | null {
  if (profileId === null) return null
  const own = picked[profileId]
  if (isColor(own)) return own
  const index = order.indexOf(profileId)
  return ACCOUNT_COLORS[(index === -1 ? order.length : index) % ACCOUNT_COLORS.length]
}

interface AccountColorsState {
  picked: Record<string, string>
  pick: (profileId: string, color: AccountColor) => void
}

export const useAccountColorsStore = create<AccountColorsState>()(
  persist(
    (set) => ({
      picked: {},
      pick: (profileId, color) => set((s) => ({ picked: { ...s.picked, [profileId]: color } }))
    }),
    { name: 'command-center.account-colors', storage: createJSONStorage(() => localStorage) }
  )
)
