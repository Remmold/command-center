import type { CliModel } from '../../shared/types'
import type { ClaudeChatSession } from './projectViewsStore'
import { useModelStore } from './modelStore'
import { currentChoice, paneModels, type ModelChoice } from './modelPicker'
import { useSessionInit } from './sessionInitStore'

export interface PaneModelChoice extends ModelChoice {
  models: CliModel[]
}

export function useModelChoice(paneId: string, session: Pick<ClaudeChatSession, 'model' | 'effort'>): PaneModelChoice {
  const init = useSessionInit(paneId)
  const cachedModels = useModelStore((s) => s.cachedModels)
  const defaults = useModelStore((s) => s.defaults)
  const applied = useModelStore((s) => s.applied[paneId])
  const models = paneModels(init?.models, cachedModels)
  return { ...currentChoice({ models, defaults, session, applied }), models }
}
