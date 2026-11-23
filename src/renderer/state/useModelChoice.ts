import type { ClaudeChatSession } from './projectViewsStore'
import { useModelStore } from './modelStore'
import { currentChoice, type ModelChoice } from './modelPicker'
import { useSessionInit, useSessionInitStore } from './sessionInitStore'

/** `workspaceProfileId` names the account a chat not yet started will run on. */
export function useModelChoice(
  paneId: string,
  session: Pick<ClaudeChatSession, 'model' | 'effort'>,
  workspaceProfileId: string | undefined
): ModelChoice {
  const init = useSessionInit(paneId)
  const cachedModels = useModelStore((s) => s.cachedModels)
  const defaults = useModelStore((s) => s.defaults)
  const applied = useModelStore((s) => s.applied[paneId])
  const profileId = useSessionInitStore((s) => s.processByPane[paneId]?.profileId) ?? workspaceProfileId
  const knownDefault = useModelStore((s) => (profileId ? s.defaultByProfile[profileId] : undefined))
  return currentChoice({ own: init?.models, cachedModels, knownDefault, defaults, session, applied })
}
