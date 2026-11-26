import { useMemo } from 'react'
import { proposalStates } from '../../../shared/featureProposal'
import { workspaceOptions } from '../../../shared/workspaceLabel'
import { goProposal, openFeatureSession, tellMainChat, useFeaturesStore, useStartedProposalsStore } from '../../state/featuresStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import type { ChatItem } from './types'
import type { ProposalHost } from './toolContext'

/** What draws the main chat's proposal blocks as cards; undefined in every other chat, which shows them as text. */
export function useProposalHost(items: ChatItem[], busy: boolean, enabled: boolean): ProposalHost | undefined {
  const features = useFeaturesStore((s) => s.features)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const started = useStartedProposalsStore((s) => s.keys)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const options = useMemo(() => (enabled ? workspaceOptions(workspaces, identities) : []), [enabled, workspaces, identities])
  const featureNames = useMemo(() => features.map((f) => f.name), [features])
  return useMemo(
    () =>
      enabled
        ? {
            states: proposalStates(items, !busy, featureNames, started),
            options,
            featureNames,
            check: async (proposal, workspaceId) => {
              const result = await window.api.features.preflight({ workspaceId, name: proposal.name, description: proposal.description, brief: proposal.brief })
              return result.ok ? null : result.error
            },
            go: async (key, proposal, workspaceId) => {
              const result = await goProposal({ workspaceId, name: proposal.name, description: proposal.description, brief: proposal.brief })
              if (!result.ran) return undefined
              if (result.error === null) useStartedProposalsStore.getState().remember(key)
              tellMainChat(proposal.name, result.error)
              return result.error
            },
            open: async (name) => {
              const feature = features.find((f) => f.name.toLowerCase() === name.toLowerCase())
              return feature ? openFeatureSession(feature) : `No feature called ${name} was found.`
            }
          }
        : undefined,
    [enabled, items, busy, features, featureNames, started, options]
  )
}
