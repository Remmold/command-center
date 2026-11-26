import { promises as fs } from 'node:fs'
import type { ModelDefaults, ModelDefaultsPatch, SaveDefaultsResult } from '../../shared/types'
import { isSettingsObject, keyPath, saveFailure, type SettingsObject, type SettingsPatch } from '../../shared/claudeSettings'
import { parseSettings, patchText, saveSettingsFile } from './settingsFile'

/** The CLI keeps Max for the current session only. */
const SESSION_ONLY_EFFORT = 'max'

function parse(text: string | null): { ok: true; settings: SettingsObject } | { ok: false; error: string } {
  const parsed = parseSettings(text)
  return parsed.ok ? { ok: true, settings: parsed.value } : { ok: false, error: `settings.json is ${parsed.error}` }
}

function modelDefaultsPatch(patch: ModelDefaultsPatch): SettingsPatch {
  const out: SettingsPatch = { set: {}, remove: [] }
  if (patch.model === null) out.remove.push('model')
  else if (patch.model !== undefined) out.set.model = patch.model
  if (patch.effort && patch.effort.level !== SESSION_ONLY_EFFORT) out.set[keyPath('modelSettings', patch.effort.resolvedModel, 'effortLevel')] = patch.effort.level
  return out
}

export function mergeModelDefaults(
  text: string | null,
  patch: ModelDefaultsPatch
): { ok: true; text: string } | { ok: false; error: string } {
  const merged = patchText(text, modelDefaultsPatch(patch))
  return merged.ok ? merged : { ok: false, error: `settings.json is ${merged.error}` }
}

export function parseModelDefaults(text: string | null): ModelDefaults {
  const parsed = parse(text)
  const settings = parsed.ok ? parsed.settings : {}
  const effortByModel: Record<string, string> = {}
  if (isSettingsObject(settings.modelSettings)) {
    for (const [model, entry] of Object.entries(settings.modelSettings)) {
      if (isSettingsObject(entry) && typeof entry.effortLevel === 'string') effortByModel[model] = entry.effortLevel
    }
  }
  return typeof settings.model === 'string' ? { model: settings.model, effortByModel } : { effortByModel }
}

/** `permissions.defaultMode` as the CLI reads it ("manual" is its alias for "default"); null when unset. */
export function parseDefaultMode(text: string | null): string | null {
  const parsed = parse(text)
  if (!parsed.ok || !isSettingsObject(parsed.settings.permissions)) return null
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

/** Goes through the Claude Code settings writer's queue; a model pick wins over whatever the file holds. */
export async function saveModelDefaults(file: string, patch: ModelDefaultsPatch): Promise<SaveDefaultsResult> {
  const saved = await saveSettingsFile(file, null, modelDefaultsPatch(patch))
  if (saved.ok) return { ok: true }
  const error = saveFailure(saved)
  console.error('[settings] not saved:', file, error)
  return { ok: false, error }
}

export async function readPromptSuggestionsAllowed(file: string): Promise<boolean> {
  try {
    return promptSuggestionsAllowed(await readText(file))
  } catch (err) {
    console.error('[settings] could not read', file, (err as Error).message)
    return true
  }
}
