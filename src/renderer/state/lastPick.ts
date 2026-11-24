import type { CliModel, ModelDefaults } from '../../shared/types'
import { effortLevels, findModel } from './modelPicker'

export interface Picked {
  model?: string
  effort?: string
}

export interface LastPicks {
  byProfile: Record<string, Picked>
  global: Picked
}

export const NO_PICKS: LastPicks = { byProfile: {}, global: {} }

export type PickChange = { model: string } | { effort: string }

/** The CLI keeps Max for the current session only. */
const SESSION_ONLY_EFFORT = 'max'

/** A model pick drops the effort picked before it, as `setSessionModel` does for the chat. */
export function recordPick(picks: LastPicks, profileId: string, pick: PickChange): LastPicks {
  if ('effort' in pick && pick.effort === SESSION_ONLY_EFFORT) return picks
  const apply = (p: Picked): Picked => ('model' in pick ? { model: pick.model } : { ...p, effort: pick.effort })
  return { byProfile: { ...picks.byProfile, [profileId]: apply(picks.byProfile[profileId] ?? {}) }, global: apply(picks.global) }
}

export interface StartingInput {
  picks: LastPicks
  profileId: string
  /** The profile's own `initialize` models; empty when none has replied yet. */
  models: readonly CliModel[]
  /** The profile's settings.json defaults. */
  defaults: ModelDefaults
  /** The chat's own stored choice, which always wins. */
  own?: Picked
}

/** The values a new chat starts with: its profile's last pick, else the last pick on any profile; unset leaves settings.json, then the CLI, to decide. */
export function startingChoice({ picks, profileId, models, defaults, own }: StartingInput): Picked {
  if (own?.model !== undefined || own?.effort !== undefined) return { ...own }
  const candidates = [picks.byProfile[profileId] ?? {}, picks.global]
  const unchecked = models.length === 0
  const model = candidates.map((p) => p.model).find((m) => m !== undefined && (unchecked || findModel(models, m) !== undefined))
  const levels = effortLevels(findModel(models, model ?? defaults.model))
  const effort = candidates.map((p) => p.effort).find((e) => e !== undefined && (unchecked || levels.includes(e)))
  return { ...(model !== undefined && { model }), ...(effort !== undefined && { effort }) }
}
