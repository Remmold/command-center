export type SettingsObject = Record<string, unknown>

/** A settings file as read from disk; `value` is null when the text does not parse to an object. */
export interface SettingsSnapshot {
  value: SettingsObject | null
  /** Null for a file that does not exist yet. */
  text: string | null
  mtime: number | null
  error?: string
}

/** Key paths are dot-separated; build one from keys that may hold a dot with `keyPath`. */
export interface SettingsPatch {
  set: Record<string, unknown>
  remove: string[]
}

export type SettingsSaveResult =
  | { ok: true; snapshot: SettingsSnapshot }
  | { ok: false; conflicts: string[] }
  | { ok: false; error: string }

export const saveFailure = (result: Exclude<SettingsSaveResult, { ok: true }>): string =>
  'error' in result ? result.error : `Claude changed ${result.conflicts.join(', ')} since this page read the file`

export const changeCount = (n: number): string => `${n} ${n === 1 ? 'change' : 'changes'}`

export type SettingsLayer = 'account' | 'repo' | 'local'

/** Where an effective value can come from, highest first. */
export const SOURCE_ORDER = ['organisation', 'local', 'repo', 'account'] as const

export type SourceLayer = (typeof SOURCE_ORDER)[number]

export interface SettingsLayerFile {
  layer: SettingsLayer
  path: string
  snapshot: SettingsSnapshot
}

export interface ClaudeSettingsRead {
  account: SettingsLayerFile & { profileId: string }
  /** Null without a workspace. */
  repo: SettingsLayerFile | null
  local: SettingsLayerFile | null
  /** Read only; null when the organisation sets nothing. */
  organisation: OrganisationFile | null
}

export interface OrganisationFile {
  path: string
  snapshot: SettingsSnapshot
}

export const isSettingsObject = (value: unknown): value is SettingsObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Joins keys into a key path, escaping `~` as `~0` and `.` as `~1` as JSON Pointer does with `/`. */
export const keyPath = (...keys: string[]): string => keys.map((key) => key.replace(/~/g, '~0').replace(/\./g, '~1')).join('.')

export const pathKeys = (path: string): string[] => path.split('.').map((key) => key.replace(/~1/g, '.').replace(/~0/g, '~'))

export function getAt(settings: SettingsObject | null, path: string): unknown {
  let at: unknown = settings
  for (const segment of pathKeys(path)) {
    if (!isSettingsObject(at)) return undefined
    at = at[segment]
  }
  return at
}

function setAt(settings: SettingsObject, path: string, value: unknown): void {
  const segments = pathKeys(path)
  const last = segments.pop() as string
  let at = settings
  for (const segment of segments) {
    if (!isSettingsObject(at[segment])) at[segment] = {}
    at = at[segment] as SettingsObject
  }
  at[last] = value
}

function removeAt(settings: SettingsObject, path: string): void {
  const segments = pathKeys(path)
  const last = segments.pop() as string
  let at: unknown = settings
  for (const segment of segments) {
    if (!isSettingsObject(at)) return
    at = at[segment]
  }
  if (isSettingsObject(at)) delete at[last]
}

/** A copy of the settings with the patch applied; new keys go at the end. */
export function withPatch(settings: SettingsObject, patch: SettingsPatch): SettingsObject {
  const patched = structuredClone(settings)
  for (const [path, value] of Object.entries(patch.set)) setAt(patched, path, value)
  for (const path of patch.remove) removeAt(patched, path)
  return patched
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  if (!isSettingsObject(a) || !isSettingsObject(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]))
}

export const patchSize = (patch: SettingsPatch): number => Object.keys(patch.set).length + patch.remove.length

export const isSettingsPatch = (value: unknown): value is SettingsPatch =>
  isSettingsObject(value) && isSettingsObject(value.set) && Array.isArray(value.remove) && value.remove.every((path) => typeof path === 'string')
