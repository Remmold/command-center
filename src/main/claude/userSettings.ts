import { promises as fs } from 'node:fs'
import type { ModelDefaults, ModelDefaultsPatch, SaveDefaultsResult } from '../../shared/types'

type Settings = Record<string, unknown>

/** The CLI keeps Max for the current session only. */
const SESSION_ONLY_EFFORT = 'max'

function isObject(value: unknown): value is Settings {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parse(text: string | null): { ok: true; settings: Settings } | { ok: false; error: string } {
  if (text === null || text.trim() === '') return { ok: true, settings: {} }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `settings.json is not valid JSON: ${(err as Error).message}` }
  }
  return isObject(value) ? { ok: true, settings: value } : { ok: false, error: 'settings.json is not a JSON object' }
}

export function mergeModelDefaults(
  text: string | null,
  patch: ModelDefaultsPatch
): { ok: true; text: string } | { ok: false; error: string } {
  const parsed = parse(text)
  if (!parsed.ok) return parsed
  const settings = { ...parsed.settings }
  if (patch.model === null) delete settings.model
  else if (patch.model !== undefined) settings.model = patch.model
  if (patch.effort && patch.effort.level !== SESSION_ONLY_EFFORT) {
    const { resolvedModel, level } = patch.effort
    const byModel = isObject(settings.modelSettings) ? settings.modelSettings : {}
    const current = isObject(byModel[resolvedModel]) ? byModel[resolvedModel] : {}
    settings.modelSettings = { ...byModel, [resolvedModel]: { ...current, effortLevel: level } }
  }
  return { ok: true, text: JSON.stringify(settings, null, 2) + '\n' }
}

export function parseModelDefaults(text: string | null): ModelDefaults {
  const parsed = parse(text)
  const settings = parsed.ok ? parsed.settings : {}
  const effortByModel: Record<string, string> = {}
  if (isObject(settings.modelSettings)) {
    for (const [model, entry] of Object.entries(settings.modelSettings)) {
      if (isObject(entry) && typeof entry.effortLevel === 'string') effortByModel[model] = entry.effortLevel
    }
  }
  return typeof settings.model === 'string' ? { model: settings.model, effortByModel } : { effortByModel }
}

/** `permissions.defaultMode` as the CLI reads it ("manual" is its alias for "default"); null when unset. */
export function parseDefaultMode(text: string | null): string | null {
  const parsed = parse(text)
  if (!parsed.ok || !isObject(parsed.settings.permissions)) return null
  const mode = parsed.settings.permissions.defaultMode
  if (typeof mode !== 'string') return null
  return mode === 'manual' ? 'default' : mode
}

/** The CLI's own rule: suggestions are on unless `promptSuggestionEnabled` is false. */
export function promptSuggestionsAllowed(text: string | null): boolean {
  const parsed = parse(text)
  return !parsed.ok || parsed.settings.promptSuggestionEnabled !== false
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function readModelDefaults(file: string): Promise<ModelDefaults> {
  try {
    return parseModelDefaults(await readText(file))
  } catch (err) {
    console.error('[settings] could not read', file, (err as Error).message)
    return { effortByModel: {} }
  }
}

export async function readDefaultMode(file: string): Promise<string | null> {
  try {
    return parseDefaultMode(await readText(file))
  } catch (err) {
    console.error('[settings] could not read', file, (err as Error).message)
    return null
  }
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Merges the patch into the file. Writes in place rather than by rename: other profiles share the
 * file through a hard link, which a rename would break.
 */
export function saveModelDefaults(file: string, patch: ModelDefaultsPatch): Promise<SaveDefaultsResult> {
  const run = async (): Promise<SaveDefaultsResult> => {
    try {
      const merged = mergeModelDefaults(await readText(file), patch)
      if (!merged.ok) {
        console.error('[settings] not saved:', file, merged.error)
        return merged
      }
      await fs.writeFile(file, merged.text, 'utf-8')
      return { ok: true }
    } catch (err) {
      console.error('[settings] could not save', file, (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  }
  const next = queue.then(run, run)
  queue = next
  return next
}

export async function readPromptSuggestionsAllowed(file: string): Promise<boolean> {
  try {
    return promptSuggestionsAllowed(await readText(file))
  } catch (err) {
    console.error('[settings] could not read', file, (err as Error).message)
    return true
  }
}
