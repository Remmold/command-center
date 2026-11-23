import { accountColor, useAccountColorsStore, type AccountColor } from './accountColors'
import { useProfilesStore } from './profilesStore'

/** The accent of an account: picked in Settings, else by its place in Settings order. */
export function useAccountColor(profileId: string | null): AccountColor | null {
  const order = useProfilesStore((s) => s.profiles.map((p) => p.id).join('\n'))
  const picked = useAccountColorsStore((s) => s.picked)
  return accountColor(profileId, order ? order.split('\n') : [], picked)
}
