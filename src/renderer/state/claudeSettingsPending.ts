import { ITEM_LISTS, editedList, getAt, isSettingsObject, isStringList, itemEdit, patchPaths, patchSize, sameValue, withPatch, type ItemEdit, type SettingsObject, type SettingsPatch } from '../../shared/claudeSettings'

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

/** A whole value with the path inside it set, or removed for undefined; undefined once nothing is left. */
function insideValue(whole: unknown, inside: string, value: unknown): unknown {
  const wrapped = { whole: isSettingsObject(whole) ? whole : {} }
  const path = `whole.${inside}`
  const next = withPatch(wrapped, value === undefined ? { set: {}, remove: [path] } : { set: { [path]: value }, remove: [] })
  return isSettingsObject(next.whole) && Object.keys(next.whole).length === 0 ? undefined : next.whole
}

const isItemList = (key: string, ...values: unknown[]): boolean => ITEM_LISTS.includes(key) && values.every((v) => v === undefined || isStringList(v))

/**
 * Stages `value` for `key`, in place of any waiting change inside it; undefined removes the key. A key inside
 * one staged whole changes that whole value instead. An item list records the items added and removed, so
 * Save keeps what Claude adds to the list meanwhile. Null once the file has no change left.
 */
export function stage(file: PendingFile | null, base: SettingsObject, key: string, value: unknown): PendingFile | null {
  const from = file?.base ?? base
  const parent = file && [...Object.keys(file.patch.set), ...file.patch.remove].find((path) => key.startsWith(`${path}.`))
  if (parent) return stage(file, base, parent, insideValue(file.patch.set[parent], key.slice(parent.length + 1), value))
  const kept = (path: string) => path !== key && !path.startsWith(`${key}.`)
  const set = Object.fromEntries(Object.entries(file?.patch.set ?? {}).filter(([path]) => kept(path)))
  const remove = (file?.patch.remove ?? []).filter(kept)
  const items = Object.fromEntries(Object.entries(file?.patch.items ?? {}).filter(([path]) => kept(path)))
  const before = getAt(from, key)
  if (isItemList(key, before, value)) {
    const edit = itemEdit((before as string[] | undefined) ?? [], (value as string[] | undefined) ?? [])
    if (edit) items[key] = edit
  } else if (!sameValue(before, value)) {
    if (value === undefined) remove.push(key)
    else set[key] = value
  }
  const patch: SettingsPatch = Object.keys(items).length > 0 ? { set, remove, items } : { set, remove }
  return patchSize(patch) === 0 ? null : { base: from, patch }
}

export function shownValue(file: PendingFile | null, snapshot: SettingsObject | null, key: string): unknown {
  const value = snapshot ?? file?.base ?? null
  return getAt(file && value ? withPatch(value, file.patch) : value, key)
}

function listAfter(before: unknown, edit: ItemEdit): string[] | undefined {
  const after = editedList(isStringList(before) ? before : [], edit)
  return after.length > 0 ? after : undefined
}

export function pendingChanges(file: PendingFile | null): PendingChange[] {
  if (!file) return []
  const { set, items = {} } = file.patch
  return patchPaths(file.patch).map((key) => {
    const before = getAt(file.base, key)
    return { key, before, after: key in items ? listAfter(before, items[key]) : set[key] }
  })
}

/**
 * The waiting changes against the file as it reads now: every key not waiting takes the file's value,
 * so only a waiting key the file changed under can conflict on Save. An item list takes the file's
 * list too, as its edit goes onto whatever the list holds.
 */
export function refreshed(file: PendingFile, disk: SettingsObject): PendingFile {
  const keys = pendingChanges(file).filter((c) => !(c.key in (file.patch.items ?? {})))
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

/** Waiting keys whose value in the file changed since the change was made, to something other than the change; an item list only once the file's value isn't a list. */
export function conflicts(file: PendingFile | null, disk: SettingsObject | null): SettingsConflict[] {
  if (!disk) return []
  const items = file?.patch.items ?? {}
  return pendingChanges(file).flatMap(({ key, before, after }) => {
    const theirs = getAt(disk, key)
    if (key in items) return theirs === undefined || isStringList(theirs) ? [] : [{ key, before, mine: after, theirs }]
    return sameValue(theirs, before) || sameValue(theirs, after) ? [] : [{ key, before, mine: after, theirs }]
  })
}

export type ConflictChoice = 'mine' | 'file'

/** The waiting changes rebased onto the file as it is now, without the keys settled as the file's; an item list's edit goes on as it was. */
export function settle(file: PendingFile, disk: SettingsObject, choices: Record<string, ConflictChoice>): PendingFile | null {
  const items = file.patch.items ?? {}
  return pendingChanges(file).reduce<PendingFile | null>((next, { key, after }) => {
    if (choices[key] === 'file') return next
    const theirs = getAt(disk, key)
    if (!(key in items) || !(theirs === undefined || isStringList(theirs))) return stage(next, disk, key, after)
    const patch = next?.patch ?? { set: {}, remove: [] }
    return { base: next?.base ?? disk, patch: { ...patch, items: { ...patch.items, [key]: items[key] } } }
  }, null)
}
