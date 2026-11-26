import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { samePath } from '../profiles/linker'
import { NEW_KEYBINDINGS, keybindingsFile, keybindingsView } from './keybindingsView'
import { getAt, isSettingsObject, isStringList, sameValue, withPatch, type OrganisationFile, type SettingsObject, type SettingsPatch, type SettingsSaveResult, type SettingsSnapshot } from '../../shared/claudeSettings'

export type ParsedSettings = { ok: true; value: SettingsObject } | { ok: false; error: string }

export type PatchResult = { ok: true; text: string } | { ok: false; conflicts: string[] } | { ok: false; error: string }

export function parseSettings(text: string | null): ParsedSettings {
  if (text === null || text.trim() === '') return { ok: true, value: {} }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${(err as Error).message}` }
  }
  return isSettingsObject(value) ? { ok: true, value } : { ok: false, error: 'not a JSON object' }
}

/** keybindings.json is read and patched as one object of keys per context; see `keybindingsView`. */
export type SettingsFileFormat = 'settings' | 'keybindings'

export const fileFormat = (file: string): SettingsFileFormat => (basename(file).toLowerCase() === 'keybindings.json' ? 'keybindings' : 'settings')

/** The file's value as patches see it, and the file's own value it was read from. */
function parseAs(text: string | null, format: SettingsFileFormat): { ok: true; value: SettingsObject; file: SettingsObject } | { ok: false; error: string } {
  if (format === 'settings') {
    const parsed = parseSettings(text)
    return parsed.ok ? { ...parsed, file: parsed.value } : parsed
  }
  const parsed = text === null ? { ok: true as const, value: NEW_KEYBINDINGS } : parseSettings(text)
  if (!parsed.ok) return parsed
  const view = keybindingsView(parsed.value)
  return view.ok ? { ok: true, value: view.value, file: parsed.value } : view
}

/**
 * Applies the patch onto the file's text. With a base, a patched path whose value in the text differs
 * from the base's is a conflict and nothing is applied; a null base applies over whatever is there. An item
 * list's edit goes onto the list as the text holds it, so it conflicts only with a value that isn't a list.
 */
export function applyPatch(text: string | null, base: SettingsObject | null, patch: SettingsPatch, format: SettingsFileFormat = 'settings'): PatchResult {
  const parsed = parseAs(text, format)
  if (!parsed.ok) return parsed
  if (base) {
    const wanted: [string, unknown][] = [...Object.entries(patch.set), ...patch.remove.map((path): [string, unknown] => [path, undefined])]
    const conflicts = wanted.flatMap(([path, value]) => {
      const onDisk = getAt(parsed.value, path)
      return sameValue(onDisk, getAt(base, path)) || sameValue(onDisk, value) ? [] : [path]
    })
    for (const path of Object.keys(patch.items ?? {})) {
      const onDisk = getAt(parsed.value, path)
      if (onDisk !== undefined && !isStringList(onDisk)) conflicts.push(path)
    }
    if (conflicts.length > 0) return { ok: false, conflicts }
  }
  return { ok: true, text: patchedText(parsed, patch, format) }
}

function patchedText(parsed: { value: SettingsObject; file: SettingsObject }, patch: SettingsPatch, format: SettingsFileFormat): string {
  const patched = withPatch(parsed.value, patch)
  return JSON.stringify(format === 'keybindings' ? keybindingsFile(parsed.file, patched) : patched, null, 2) + '\n'
}

/** Applies the patch over whatever the text holds, with no conflict check. */
export function patchText(text: string | null, patch: SettingsPatch): { ok: true; text: string } | { ok: false; error: string } {
  const parsed = parseAs(text, 'settings')
  return parsed.ok ? { ok: true, text: patchedText(parsed, patch, 'settings') } : parsed
}

async function readText(file: string): Promise<{ text: string; mtime: number } | null> {
  try {
    const [text, stat] = await Promise.all([fs.readFile(file, 'utf-8'), fs.stat(file)])
    return { text, mtime: stat.mtimeMs }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function readSettingsFile(file: string): Promise<SettingsSnapshot> {
  const read = await readText(file)
  if (!read) return { value: {}, text: null, mtime: null }
  const parsed = parseAs(read.text, fileFormat(file))
  return parsed.ok ? { value: parsed.value, text: read.text, mtime: read.mtime } : { value: null, text: read.text, mtime: read.mtime, error: parsed.error }
}

export const MANAGED_SETTINGS_FILE = 'C:\\Program Files\\ClaudeCode\\managed-settings.json'

/**
 * The organisation's settings, read only: the account's cached remote settings, else the managed file.
 * Claude uses only the first of them that sets any key, so an empty `{}` cache falls through. A file
 * that does not parse comes back with its error, as the page can't tell what it enforces.
 */
export async function readOrganisationLayer(remoteFile: string, managedFile: string): Promise<OrganisationFile | null> {
  for (const path of [remoteFile, managedFile]) {
    const snapshot = await readSettingsFile(path)
    if (!snapshot.value ? snapshot.text !== null : Object.keys(snapshot.value).length > 0) return { path, snapshot }
  }
  return null
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Re-reads the file and writes the patch onto it, one save at a time. Writes in place rather than by
 * rename: app-made profiles share the file through a hard link, which a rename would break (ADR 0007).
 */
export function saveSettingsFile(file: string, base: SettingsObject | null, patch: SettingsPatch): Promise<SettingsSaveResult> {
  const run = async (): Promise<SettingsSaveResult> => {
    try {
      const patched = applyPatch((await readText(file))?.text ?? null, base, patch, fileFormat(file))
      if (!patched.ok) return patched
      await fs.mkdir(dirname(file), { recursive: true })
      await fs.writeFile(file, patched.text, 'utf-8')
      return { ok: true, snapshot: await readSettingsFile(file) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
  const next = queue.then(run, run)
  queue = next
  return next
}

export interface SettingsTargets {
  configDirs: readonly string[]
  workspacePaths: readonly string[]
}

const ACCOUNT_FILES = ['settings.json', 'keybindings.json']
const WORKSPACE_FILES = [join('.claude', 'settings.json'), join('.claude', 'settings.local.json')]
const SECRET_NAMES = new Set(['.claude.json', '.credentials.json'])

async function pointsAtSecret(path: string): Promise<boolean> {
  try {
    return SECRET_NAMES.has(basename(await fs.realpath(path)).toLowerCase())
  } catch {
    return false
  }
}

/** Null when the path is one of the files this module may write, else why not. */
export async function settingsTargetProblem(path: string, targets: SettingsTargets): Promise<string | null> {
  const allowed = [
    ...targets.configDirs.flatMap((dir) => ACCOUNT_FILES.map((name) => join(dir, name))),
    ...targets.workspacePaths.flatMap((dir) => WORKSPACE_FILES.map((name) => join(dir, name)))
  ]
  if (!allowed.some((target) => samePath(target, path))) return 'not a Claude settings file of an account or workspace'
  if (await pointsAtSecret(path)) return 'that file holds the sign-in'
  return null
}
