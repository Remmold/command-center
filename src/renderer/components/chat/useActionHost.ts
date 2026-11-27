import { useMemo } from 'react'
import { adoptOutcomeMessage } from '../../../shared/adoptWork'
import { housekeepingOutcomeMessage } from '../../../shared/housekeeping'
import { mainChatCardStates } from '../../../shared/mainChatActions'
import { featureNamed } from '../../../shared/openSession'
import { workspaceOptions } from '../../../shared/workspaceLabel'
import { MAIN_CHAT_OUTCOME } from '../../state/actionOutcome'
import { useDoneActionsStore } from '../../state/doneActionsStore'
import { submitFeatureMessage } from '../../state/featureMessages'
import { adoptOpenWork, featureSessionProblem, goProposal, openFeatureSession, useFeaturesStore } from '../../state/featuresStore'
import { goOutcome, settleOutcome } from '../../state/proposalGo'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import type { ChatItem } from './types'
import type { ActionHost } from './toolContext'

/** What draws the main chat's action blocks as cards; undefined in every other chat, which shows them as text. */
export function useActionHost(items: ChatItem[], busy: boolean, enabled: boolean): ActionHost | undefined {
  const features = useFeaturesStore((s) => s.features)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const done = useDoneActionsStore((s) => s.keys)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const options = useMemo(() => (enabled ? workspaceOptions(workspaces, identities) : []), [enabled, workspaces, identities])
  const featureNames = useMemo(() => features.map((f) => f.name), [features])
  return useMemo(() => {
    if (!enabled) return undefined
    const states = mainChatCardStates(items, !busy, { featureNames }, done)
    // Only a live card acts: the click on it is the one consent, and a card gone read-only meanwhile does nothing.
    const live = (key: string): boolean => states.get(key) === 'live'
    const remember = (key: string): void => useDoneActionsStore.getState().remember(key)
    const labelOf = (workspaceId: string, fallback: string): string => options.find((o) => o.id === workspaceId)?.label ?? fallback
    return {
      states,
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
          if (result.error === null) remember(key)
          settleOutcome(goOutcome({ name: proposal.name, workspace: labelOf(workspaceId, proposal.workspace) }, result.error), MAIN_CHAT_OUTCOME)
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
          settleOutcome({ kind: 'none' }, MAIN_CHAT_OUTCOME)
          return error
        }
      },
      adopt: {
        check: (block, workspaceId) => window.api.features.adoptPreflight({ workspaceId, branch: block.branch, path: block.path, name: block.name }),
        go: async (key, block, workspaceId) => {
          if (!live(key)) return undefined
          const result = await adoptOpenWork({ workspaceId, branch: block.branch, path: block.path, name: block.name })
          if (result.ok) remember(key)
          const outcome = result.ok ? { name: result.feature.name, resumed: result.resumed } : { error: result.error }
          settleOutcome({ kind: 'tell', text: adoptOutcomeMessage(block.branch, labelOf(workspaceId, block.workspace), outcome) }, MAIN_CHAT_OUTCOME)
          return result.ok ? null : result.error
        }
      },
      sendMessage: {
        check: (name) => {
          const found = featureNamed(name, features)
          return found.kind === 'ok' ? featureSessionProblem(found.feature) : found.problem
        },
        send: async (key, block) => {
          if (!live(key)) return undefined
          const found = featureNamed(block.feature, features)
          if (found.kind !== 'ok') return found.problem
          const sent = await submitFeatureMessage(found.feature.name, key, block.message)
          if (sent.state === 'failed') return sent.error
          remember(key)
          return null
        }
      },
      housekeeping: {
        check: (request) => window.api.housekeeping.check(request),
        run: async (key, request) => {
          if (!live(key)) return undefined
          const run = await window.api.housekeeping.run(request)
          if (run.ok && run.results.every((r) => r.ok)) remember(key)
          const workspace = labelOf(request.workspaceId, request.workspaceId)
          settleOutcome({ kind: 'tell', text: housekeepingOutcomeMessage(workspace, request.action, run) }, MAIN_CHAT_OUTCOME)
          return run
        }
      }
    }
  }, [enabled, items, busy, features, featureNames, done, options])
}
