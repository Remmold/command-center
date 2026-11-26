import { getAt, sameValue, type SettingsObject, type SettingsPatch } from '../../shared/claudeSettings'

/** The changes waiting for one file, against the file as the page read it when the first change was made. */
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
  return getAt(file?.base ?? snapshot, key)
}

export function pendingChanges(file: PendingFile | null): PendingChange[] {
  if (!file) return []
  return [...Object.keys(file.patch.set), ...file.patch.remove].map((key) => ({ key, before: getAt(file.base, key), after: file.patch.set[key] }))
}
