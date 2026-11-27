import { useMemo } from 'react'
import { mainChatCardStates } from '../../../shared/mainChatActions'
import { featureNamed } from '../../../shared/openSession'
import { workspaceOptions } from '../../../shared/workspaceLabel'
import { useDoneActionsStore } from '../../state/doneActionsStore'
import { goProposal, openFeatureSession, tellMainChat, useFeaturesStore } from '../../state/featuresStore'
import { resetMainChat } from '../../state/mainChatStore'
import { goOutcome, settleOutcome, type OutcomeDeps } from '../../state/proposalGo'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import type { ChatItem } from './types'
import type { ActionHost } from './toolContext'

const OUTCOME: OutcomeDeps = { reset: (started) => void resetMainChat(started), tell: tellMainChat }

/** What draws the main chat's action blocks as cards; undefined in every other chat, which shows them as text. */
export function useActionHost(items: ChatItem[], busy: boolean, enabled: boolean): ActionHost | undefined {
  const features = useFeaturesStore((s) => s.features)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const done = useDoneActionsStore((s) => s.keys)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const options = useMemo(() => (enabled ? workspaceOptions(workspaces, identities) : []), [enabled, workspaces, identities])
  const featureNames = useMemo(() => features.map((f) => f.name), [features])
  return useMemo(
    () =>
      enabled
        ? {
            states: mainChatCardStates(items, !busy, { featureNames }, done),
            options,
            features,
            featureNames,
            proposal: {
              check: async (proposal, workspaceId) => {
                const result = await window.api.features.preflight({ workspaceId, name: proposal.name, description: proposal.description, brief: proposal.brief })
                return result.ok ? null : result.error
              },
              go: async (key, proposal, workspaceId) => {
                const result = await goProposal({ workspaceId, name: proposal.name, description: proposal.description, brief: proposal.brief })
                if (!result.ran) return undefined
                if (result.error === null) useDoneActionsStore.getState().remember(key)
                const workspace = options.find((o) => o.id === workspaceId)?.label ?? proposal.workspace
                settleOutcome(goOutcome({ name: proposal.name, workspace }, result.error), OUTCOME)
                return result.error
              },
              open: async (name) => {
                const feature = features.find((f) => f.name.toLowerCase() === name.toLowerCase())
                return feature ? openFeatureSession(feature) : `No feature called ${name} was found.`
              }
            },
            openSession: {
              check: (name) => {
                const found = featureNamed(name, features)
                return found.kind === 'ok' ? null : found.problem
              },
              open: async (name) => {
                const found = featureNamed(name, features)
                const error = found.kind === 'ok' ? await openFeatureSession(found.feature) : found.problem
                settleOutcome({ kind: 'none' }, OUTCOME)
                return error
              }
            }
          }
        : undefined,
    [enabled, items, busy, features, featureNames, done, options]
  )
}
