import { create } from 'zustand'
import {
  repoDisplayName,
  type BuiltinIconChoice,
  type RepoIdentityView,
  type RepoIdentityViews
} from '../../shared/repoIdentity'

interface RepoIdentitiesState {
  identities: RepoIdentityViews
  load: () => Promise<void>
  /** Each change resolves to an error message to show, or null. */
  setDisplayName: (repoGroupKey: string, name: string) => Promise<string | null>
  setIcon: (repoGroupKey: string, icon: BuiltinIconChoice | undefined) => Promise<string | null>
  chooseImage: (repoGroupKey: string) => Promise<string | null>
}

async function saved(
  request: Promise<RepoIdentityViews>,
  set: (state: Pick<RepoIdentitiesState, 'identities'>) => void,
  failure: string
): Promise<string | null> {
  try {
    set({ identities: await request })
    return null
  } catch (err) {
    console.error(failure, err)
    return failure
  }
}

export const useRepoIdentitiesStore = create<RepoIdentitiesState>((set) => ({
  identities: {},
  load: async () => {
    try {
      set({ identities: await window.api.repoIdentities.list() })
    } catch (err) {
      console.error('failed to load repo identities', err)
    }
  },
  setDisplayName: (repoGroupKey, name) =>
    saved(window.api.repoIdentities.setDisplayName(repoGroupKey, name), set, 'Could not save the name.'),
  setIcon: (repoGroupKey, icon) =>
    saved(window.api.repoIdentities.setIcon(repoGroupKey, icon), set, 'Could not save the icon.'),
  chooseImage: async (repoGroupKey) => {
    try {
      const result = await window.api.repoIdentities.chooseImage(repoGroupKey)
      if (!result) return null
      if (!result.ok) return result.error
      set({ identities: result.identities })
      return null
    } catch (err) {
      console.error('failed to import repo icon', err)
      return 'Could not read that file.'
    }
  }
}))

export function useRepoIdentity(repoGroupKey: string): RepoIdentityView | undefined {
  return useRepoIdentitiesStore((s) => s.identities[repoGroupKey])
}

export function useRepoDisplayName(repoGroupKey: string, repoName: string): string {
  return repoDisplayName(repoName, useRepoIdentity(repoGroupKey))
}
