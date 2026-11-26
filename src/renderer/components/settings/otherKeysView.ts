import { getAt, patchPaths, type SettingsObject, type SettingsSnapshot } from '../../../shared/claudeSettings'
import { otherKeys } from '../../../shared/claudeSettingsCatalog'
import { conflicts, type PendingFile } from '../../state/claudeSettingsPending'

export interface OtherKeyRow {
  path: string
  /** With its waiting change; undefined once its removal waits for Save. */
  value: unknown
  /** As the file had it when its change was made. */
  before: unknown
  changed: boolean
  /** Set when the file on disk changed this waiting key since it was edited; holds the file's value now. */
  fileValue?: { value: unknown }
}

/** The file's other keys with their waiting changes, a key waiting to be removed included. */
export function otherKeyRows(disk: SettingsObject | null, edited: SettingsObject | null, pending: PendingFile | null): OtherKeyRow[] {
  const before = pending?.base ?? disk
  const fileChanged = new Map(conflicts(pending, disk).map((c) => [c.key, { value: c.theirs }]))
  const paths = [...new Set([...otherKeys(before), ...otherKeys(edited)])]
  return paths.map((path) => ({
    path,
    value: getAt(edited, path),
    before: getAt(before, path),
    changed: pending !== null && patchPaths(pending.patch).includes(path),
    fileValue: fileChanged.get(path)
  }))
}

export function otherKeysNotice(snapshot: SettingsSnapshot, rows: number): string {
  if (snapshot.value === null) return `This file is ${snapshot.error}, so its keys can’t be listed until it parses.`
  return rows === 0 ? 'Every key in this file has its own setting above.' : 'Keys this page has no control for, as raw JSON. Leaving a box checks it before the change waits for Save.'
}
