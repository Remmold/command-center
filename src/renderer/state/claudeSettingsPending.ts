import { getAt, sameValue, withPatch, type SettingsObject, type SettingsPatch } from '../../shared/claudeSettings'

/** The changes waiting for one file, against the file as last read, each waiting key as it was when its change was made. */
export interface PendingFile {
  base: SettingsObject
  patch: SettingsPatch
}

export interface PendingChange {
  key: string
  before: unknown
  after: unknown
}

/** Stages `value` for `key`; undefined removes the key. Null once the file has no change left. */
export function stage(file: PendingFile | null, base: SettingsObject, key: string, value: unknown): PendingFile | null {
  const from = file?.base ?? base
  const { [key]: _old, ...set } = file?.patch.set ?? {}
  const remove = (file?.patch.remove ?? []).filter((path) => path !== key)
  if (!sameValue(getAt(from, key), value)) {
    if (value === undefined) remove.push(key)
    else set[key] = value
  }
  return Object.keys(set).length + remove.length === 0 ? null : { base: from, patch: { set, remove } }
}

export function shownValue(file: PendingFile | null, snapshot: SettingsObject | null, key: string): unknown {
  if (file && key in file.patch.set) return file.patch.set[key]
  if (file?.patch.remove.includes(key)) return undefined
  return getAt(snapshot ?? file?.base ?? null, key)
}

export function pendingChanges(file: PendingFile | null): PendingChange[] {
  if (!file) return []
  return [...Object.keys(file.patch.set), ...file.patch.remove].map((key) => ({ key, before: getAt(file.base, key), after: file.patch.set[key] }))
}

/**
 * The waiting changes against the file as it reads now: every key not waiting takes the file's value,
 * so only a waiting key the file changed under can conflict on Save.
 */
export function refreshed(file: PendingFile, disk: SettingsObject): PendingFile {
  const keys = pendingChanges(file)
  const set = Object.fromEntries(keys.filter((c) => c.before !== undefined).map((c) => [c.key, c.before]))
  const remove = keys.filter((c) => c.before === undefined).map((c) => c.key)
  return { base: withPatch(disk, { set, remove }), patch: file.patch }
}

export interface SettingsConflict {
  key: string
  before: unknown
  mine: unknown
  /** The value in the file now. */
  theirs: unknown
}

/** Waiting keys whose value in the file changed since the change was made, to something other than the change. */
export function conflicts(file: PendingFile | null, disk: SettingsObject | null): SettingsConflict[] {
  if (!disk) return []
  return pendingChanges(file).flatMap(({ key, before, after }) => {
    const theirs = getAt(disk, key)
    return sameValue(theirs, before) || sameValue(theirs, after) ? [] : [{ key, before, mine: after, theirs }]
  })
}

export type ConflictChoice = 'mine' | 'file'

/** The waiting changes rebased onto the file as it is now, without the keys settled as the file's. */
export function settle(file: PendingFile, disk: SettingsObject, choices: Record<string, ConflictChoice>): PendingFile | null {
  return pendingChanges(file).reduce<PendingFile | null>(
    (next, { key, after }) => (choices[key] === 'file' ? next : stage(next, disk, key, after)),
    null
  )
}
