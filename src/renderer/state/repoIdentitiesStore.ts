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
  setDisplayName: (repoGroupKey: string, name: string) => Promise<void>
  setIcon: (repoGroupKey: string, icon: BuiltinIconChoice | undefined) => Promise<void>
  /** Resolves to an error message to show, or null. */
  chooseImage: (repoGroupKey: string) => Promise<string | null>
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
  setDisplayName: async (repoGroupKey, name) => {
    set({ identities: await window.api.repoIdentities.setDisplayName(repoGroupKey, name) })
  },
  setIcon: async (repoGroupKey, icon) => {
    set({ identities: await window.api.repoIdentities.setIcon(repoGroupKey, icon) })
  },
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
