import { create } from 'zustand'
import type { AccountProfile, Workspace } from '../../shared/types'

interface ProfilesState {
  profiles: AccountProfile[]
  /** Re-reads logged-in state too, so call it whenever the list comes on screen. */
  load: () => Promise<void>
  create: (name: string) => Promise<AccountProfile | null>
  rename: (id: string, name: string) => Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  load: async () => {
    try {
      set({ profiles: await window.api.profiles.list() })
    } catch (err) {
      console.error('failed to load profiles', err)
    }
  },
  create: async (name) => {
    try {
      const created = await window.api.profiles.create(name)
      await get().load()
      return created
    } catch (err) {
      console.error('failed to create profile', err)
      return null
    }
  },
  rename: async (id, name) => {
    try {
      await window.api.profiles.rename(id, name)
      await get().load()
    } catch (err) {
      console.error('failed to rename profile', err)
    }
  }
}))

/** Login needs a shell somewhere; prefer a workspace that already uses the profile. */
export function loginWorkspace(workspaces: readonly Workspace[], profile: AccountProfile): Workspace | undefined {
  return workspaces.find((w) => w.profileId === profile.id) ?? workspaces[0]
}
