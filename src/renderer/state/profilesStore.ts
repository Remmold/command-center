import { create } from 'zustand'
import type { AccountProfile, AdoptResult, VsCodeConfigDir, Workspace } from '../../shared/types'

interface ProfilesState {
  profiles: AccountProfile[]
  /** The first load has finished, whatever its outcome. */
  loaded: boolean
  /** Re-reads logged-in state too, so call it whenever the list comes on screen. */
  load: () => Promise<void>
  create: (name: string) => Promise<AccountProfile | null>
  rename: (id: string, name: string) => Promise<void>
  suggestions: VsCodeConfigDir[]
  /** The last refused adoption, shown until the next attempt. */
  adoptError: string | null
  adopt: (path: string) => Promise<void>
  chooseFolder: () => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loaded: false,
  suggestions: [],
  adoptError: null,
  load: async () => {
    try {
      const [profiles, suggestions] = await Promise.all([window.api.profiles.list(), window.api.profiles.suggestions()])
      set({ profiles, suggestions, loaded: true })
    } catch (err) {
      console.error('failed to load profiles', err)
      set({ loaded: true })
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
  },
  adopt: async (path) => settleAdoption(await window.api.profiles.adopt(path).catch(adoptFailure)),
  chooseFolder: async () => {
    const result = await window.api.profiles.chooseFolder().catch(adoptFailure)
    if (result) await settleAdoption(result)
  },
  remove: async (id) => {
    try {
      await window.api.profiles.remove(id)
      await get().load()
    } catch (err) {
      console.error('failed to remove profile', err)
    }
  }
}))

function adoptFailure(err: unknown): AdoptResult {
  console.error('failed to add existing folder', err)
  return { ok: false, error: 'Could not add that folder.' }
}

async function settleAdoption(result: AdoptResult): Promise<void> {
  useProfilesStore.setState({ adoptError: result.ok ? null : result.error })
  if (result.ok) await useProfilesStore.getState().load()
}

/** Login needs a shell somewhere; prefer a workspace that already uses the profile. */
export function loginWorkspace(workspaces: readonly Workspace[], profile: AccountProfile): Workspace | undefined {
  return workspaces.find((w) => w.profileId === profile.id) ?? workspaces[0]
}
