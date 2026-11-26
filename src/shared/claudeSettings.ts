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
  /** Per item list (`ITEM_LISTS`), the items to add and remove, applied to the list as it is then. */
  items?: Record<string, ItemEdit>
}

export interface ItemEdit {
  add: string[]
  remove: string[]
}

/** The string lists Claude appends to itself, such as an "always allow" rule; they are patched per item, never whole (ADR 0006). */
export const ITEM_LISTS: readonly string[] = ['permissions.allow', 'permissions.ask', 'permissions.deny', 'permissions.additionalDirectories']

export const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

/** The list with the edit applied: each removed item's first copy out, each added item not there yet onto the end. */
export function editedList(list: readonly string[], edit: ItemEdit): string[] {
  const next = [...list]
  for (const item of edit.remove) {
    const at = next.indexOf(item)
    if (at >= 0) next.splice(at, 1)
  }
  for (const item of edit.add) if (!next.includes(item)) next.push(item)
  return next
}

/** The edit that turns `from` into `to`, ignoring order; null when they hold the same items. */
export function itemEdit(from: readonly string[], to: readonly string[]): ItemEdit | null {
  const left = [...to]
  const remove = from.filter((item) => {
    const at = left.indexOf(item)
    if (at < 0) return true
    left.splice(at, 1)
    return false
  })
  return remove.length + left.length === 0 ? null : { add: left, remove }
}

/** Every key path the patch touches. */
export const patchPaths = (patch: SettingsPatch): string[] => [...Object.keys(patch.set), ...patch.remove, ...Object.keys(patch.items ?? {})]

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

/** A watched settings file that changed on disk, as it reads now. */
export interface SettingsFileChange {
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

/** Deletes the key and each parent object that deletion emptied; an object that was already empty stays. */
function removeAt(settings: SettingsObject, path: string): void {
  const segments = pathKeys(path)
  const parents: SettingsObject[] = [settings]
  for (const segment of segments.slice(0, -1)) {
    const next = parents[parents.length - 1][segment]
    if (!isSettingsObject(next)) return
    parents.push(next)
  }
  for (let depth = segments.length - 1; depth >= 0; depth--) {
    if (!Object.hasOwn(parents[depth], segments[depth])) return
    delete parents[depth][segments[depth]]
    if (depth > 0 && Object.keys(parents[depth]).length > 0) return
  }
}

/** A copy of the settings with the patch applied; new keys go at the end. */
export function withPatch(settings: SettingsObject, patch: SettingsPatch): SettingsObject {
  const patched = structuredClone(settings)
  for (const [path, value] of Object.entries(patch.set)) setAt(patched, path, value)
  for (const path of patch.remove) removeAt(patched, path)
  for (const [path, edit] of Object.entries(patch.items ?? {})) {
    const onFile = getAt(patched, path)
    const next = editedList(isStringList(onFile) ? onFile : [], edit)
    if (next.length > 0) setAt(patched, path, next)
    else removeAt(patched, path)
  }
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

export const patchSize = (patch: SettingsPatch): number => patchPaths(patch).length

export const isSettingsPatch = (value: unknown): value is SettingsPatch =>
  isSettingsObject(value) &&
  isSettingsObject(value.set) &&
  isStringList(value.remove) &&
  (value.items === undefined || (isSettingsObject(value.items) && Object.values(value.items).every((edit) => isSettingsObject(edit) && isStringList(edit.add) && isStringList(edit.remove))))
