import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { samePath } from '../profiles/linker'
import { getAt, isSettingsObject, sameValue, type SettingsObject, type SettingsPatch, type SettingsSaveResult, type SettingsSnapshot } from '../../shared/claudeSettings'

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

function setAt(settings: SettingsObject, path: string, value: unknown): void {
  const segments = path.split('.')
  const last = segments.pop() as string
  let at = settings
  for (const segment of segments) {
    if (!isSettingsObject(at[segment])) at[segment] = {}
    at = at[segment] as SettingsObject
  }
  at[last] = value
}

function removeAt(settings: SettingsObject, path: string): void {
  const segments = path.split('.')
  const last = segments.pop() as string
  let at: unknown = settings
  for (const segment of segments) {
    if (!isSettingsObject(at)) return
    at = at[segment]
  }
  if (isSettingsObject(at)) delete at[last]
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
  const settings = structuredClone(parsed.value)
  for (const [path, value] of Object.entries(patch.set)) setAt(settings, path, value)
  for (const path of patch.remove) removeAt(settings, path)
  return { ok: true, text: JSON.stringify(settings, null, 2) + '\n' }
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
