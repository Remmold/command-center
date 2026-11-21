import type { CliModel, ModelDefaults } from '../../shared/types'

export const DEFAULT_MODEL = 'default'

const EFFORT_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max'
}

const FALLBACK_EFFORT_LEVELS = ['low', 'medium', 'high']

const ALIAS = /\balias(?:es)?\b/i

export function effortLabel(level: string | undefined): string {
  return level ? (EFFORT_LABEL[level] ?? 'Auto') : 'Auto'
}

export function effortLevels(model: CliModel | undefined): string[] {
  if (!model?.supportsEffort) return []
  return model.supportedEffortLevels.length > 0 ? model.supportedEffortLevels : FALLBACK_EFFORT_LEVELS
}

export function nextEffort(levels: readonly string[], current: string | undefined): string {
  const at = current ? levels.indexOf(current) : -1
  return levels[(at + 1) % levels.length]
}

/** The CLI's order, with alias entries last. */
export function pickerModels(models: readonly CliModel[]): CliModel[] {
  const isAlias = (m: CliModel): boolean => ALIAS.test(`${m.displayName} ${m.description}`)
  return [...models.filter((m) => !isAlias(m)), ...models.filter(isAlias)]
}

/** A pane's own `initialize` models, else the cached list from any session. */
export function paneModels(own: readonly CliModel[] | undefined, cached: CliModel[]): CliModel[] {
  return own && own.length > 0 ? [...own] : cached
}

/** No selection means the CLI's own default. */
export function findModel(models: readonly CliModel[], selection: string | undefined): CliModel | undefined {
  const value = selection ?? DEFAULT_MODEL
  return (
    models.find((m) => m.value === value) ??
    models.find((m) => m.value !== DEFAULT_MODEL && m.resolvedModel === value)
  )
}

export interface PillInput {
  models: readonly CliModel[]
  selection: string | undefined
  /** The full model id the CLI reports serving. */
  servedModel?: string
  effort?: string
}

export interface Pill {
  label: string
  effort?: string
}

const MODEL_ID = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2})(?!\d))?/

/** "Opus" for `claude-opus-5-5` reads "Opus 5.5". */
export function versionedName(model: CliModel): string {
  const match = MODEL_ID.exec(model.resolvedModel)
  if (!match || model.displayName.toLowerCase() !== match[1]) return model.displayName
  const [, , major, minor] = match
  return minor === undefined ? `${model.displayName} ${major}` : `${model.displayName} ${major}.${minor}`
}

export function pillText({ models, selection, servedModel, effort }: PillInput): Pill {
  const entry = findModel(models, selection)
  const served =
    entry?.value === DEFAULT_MODEL && servedModel
      ? models.find((m) => m.value !== DEFAULT_MODEL && m.resolvedModel === servedModel)
      : undefined
  const shown = served ?? entry
  const label = shown ? versionedName(shown) : (selection ?? 'Model')
  return entry?.supportsEffort && effort ? { label, effort: effortLabel(effort) } : { label }
}

export function sessionTag(pill: Pill): string {
  const short = pill.label.replace(/\s*\(.*\)\s*$/, '')
  return pill.effort ? `${short} · ${pill.effort}` : short
}

/** The effort new sessions on this model start with. */
export function defaultEffort(models: readonly CliModel[], defaults: ModelDefaults, selection: string | undefined): string | undefined {
  const resolved = findModel(models, selection ?? defaults.model)?.resolvedModel
  return resolved ? defaults.effortByModel[resolved] : undefined
}

export interface LaunchInput {
  models: readonly CliModel[]
  defaults: ModelDefaults
  selection: string | undefined
  effort: string | undefined
}

/** Flags only for the session's own picks that the saved defaults would not give it. */
export function launchChoice({ models, defaults, selection, effort }: LaunchInput): { model?: string; effort?: string } {
  const choice: { model?: string; effort?: string } = {}
  if (selection !== undefined && selection !== (defaults.model ?? DEFAULT_MODEL)) choice.model = selection
  if (effort !== undefined && effort !== defaultEffort(models, defaults, selection)) choice.effort = effort
  return choice
}

export interface SavedModelChoices {
  views?: Record<string, { claudeSessions: Array<{ thinking?: unknown }> }>
  defaultModel?: unknown
}

/** Mutates the saved state in place, like the other migration steps. */
export function migrateModelChoices(state: SavedModelChoices): void {
  for (const v of Object.values(state.views ?? {})) {
    v.claudeSessions = v.claudeSessions.map((c) => (typeof c.thinking === 'boolean' ? c : { ...c, thinking: true }))
  }
  delete state.defaultModel
}

export interface ChoiceInput {
  /** The pane's own `initialize` models, else the cached list. */
  models: readonly CliModel[]
  defaults: ModelDefaults
  session: { model?: string; effort?: string }
  applied?: { model?: string; effort?: string }
}

export interface ModelChoice {
  selection: string | undefined
  entry: CliModel | undefined
  effort: string | undefined
  levels: string[]
  pill: Pill
}

/** What the pane runs: the running CLI's report first, then the session's picks, then the saved defaults. */
export function currentChoice({ models, defaults, session, applied }: ChoiceInput): ModelChoice {
  const selection = session.model ?? defaults.model
  const entry = findModel(models, selection)
  const effort = applied?.effort ?? session.effort ?? defaultEffort(models, defaults, selection)
  return {
    selection,
    entry,
    effort,
    levels: effortLevels(entry),
    pill: pillText({ models, selection, servedModel: applied?.model, effort })
  }
}
