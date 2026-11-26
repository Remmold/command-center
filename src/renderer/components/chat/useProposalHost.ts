import { useMemo } from 'react'
import { proposalStates } from '../../../shared/featureProposal'
import { workspaceOptions } from '../../../shared/workspaceLabel'
import { goProposal, openFeatureSession, useFeaturesStore } from '../../state/featuresStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import type { ChatItem } from './types'
import type { ProposalHost } from './toolContext'

/** What draws the main chat's proposal blocks as cards; undefined in every other chat, which shows them as text. */
export function useProposalHost(items: ChatItem[], busy: boolean, enabled: boolean): ProposalHost | undefined {
  const features = useFeaturesStore((s) => s.features)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const options = useMemo(() => (enabled ? workspaceOptions(workspaces, identities) : []), [enabled, workspaces, identities])
  return useMemo(
    () =>
      enabled
        ? {
            states: proposalStates(items, !busy, features.map((f) => f.name)),
            options,
            go: async (proposal, workspaceId) => {
              const result = await goProposal({ workspaceId, name: proposal.name, description: proposal.description, brief: proposal.brief })
              return result.ran ? result.error : undefined
            },
            open: async (name) => {
              const feature = features.find((f) => f.name.toLowerCase() === name.toLowerCase())
              return feature ? openFeatureSession(feature) : `No feature called ${name} was found.`
            }
          }
        : undefined,
    [enabled, items, busy, features, options]
  )
}
