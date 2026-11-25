import { useEffect, useMemo } from 'react'
import type { ClaudeChatSession } from './projectViewsStore'
import { defaultsOf, useModelStore } from './modelStore'
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
  const applied = useModelStore((s) => s.applied[paneId])
  const profileId = useSessionInitStore((s) => s.processByPane[paneId]?.profileId) ?? workspaceProfileId
  const defaults = useModelStore((s) => defaultsOf(s.settingsByProfile, profileId))
  const loaded = useModelStore((s) => profileId === undefined || profileId in s.settingsByProfile)
  useEffect(() => {
    if (!loaded && profileId) void useModelStore.getState().loadDefaults(profileId)
  }, [loaded, profileId])
  const knownDefault = useModelStore((s) => (profileId ? s.defaultByProfile[profileId] : undefined))
  const own = init?.models
  const { model, effort } = session
  // One object while its inputs stay the same, so the chat's footer does not redraw on every render.
  return useMemo(
    () => currentChoice({ own, cachedModels, knownDefault, defaults, session: { model, effort }, applied }),
    [own, cachedModels, knownDefault, defaults, model, effort, applied]
  )
}
