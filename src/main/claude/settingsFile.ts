import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { samePath } from '../profiles/linker'
import { getAt, isSettingsObject, sameValue, withPatch, type OrganisationFile, type SettingsObject, type SettingsPatch, type SettingsSaveResult, type SettingsSnapshot } from '../../shared/claudeSettings'

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

/**
 * Applies the patch onto the file's text. With a base, a patched path whose value in the text differs
 * from the base's is a conflict and nothing is applied; a null base applies over whatever is there.
 */
export function applyPatch(text: string | null, base: SettingsObject | null, patch: SettingsPatch): PatchResult {
  const parsed = parseSettings(text)
  if (!parsed.ok) return parsed
  if (base) {
    const wanted: [string, unknown][] = [...Object.entries(patch.set), ...patch.remove.map((path): [string, unknown] => [path, undefined])]
    const conflicts = wanted.flatMap(([path, value]) => {
      const onDisk = getAt(parsed.value, path)
      return sameValue(onDisk, getAt(base, path)) || sameValue(onDisk, value) ? [] : [path]
    })
    if (conflicts.length > 0) return { ok: false, conflicts }
  }
  return { ok: true, text: patchedText(parsed.value, patch) }
}

const patchedText = (value: SettingsObject, patch: SettingsPatch): string => JSON.stringify(withPatch(value, patch), null, 2) + '\n'

/** Applies the patch over whatever the text holds, with no conflict check. */
export function patchText(text: string | null, patch: SettingsPatch): { ok: true; text: string } | { ok: false; error: string } {
  const parsed = parseSettings(text)
  return parsed.ok ? { ok: true, text: patchedText(parsed.value, patch) } : parsed
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
  const parsed = parseSettings(read.text)
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
 * rename: app-made profiles share the file through a hard link, which a rename would break (ADR 0006).
 */
export function saveSettingsFile(file: string, base: SettingsObject | null, patch: SettingsPatch): Promise<SettingsSaveResult> {
  const run = async (): Promise<SettingsSaveResult> => {
    try {
      const patched = applyPatch((await readText(file))?.text ?? null, base, patch)
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
