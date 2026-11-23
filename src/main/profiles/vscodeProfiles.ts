import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { CONFIG_DIR_VAR } from '../../shared/profiles'
import type { VsCodeConfigDir, VsCodeFolderAccount } from '../../shared/types'

export type { VsCodeConfigDir, VsCodeFolderAccount }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function stringEnd(text: string, start: number): number {
  let i = start + 1
  for (; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
  return i
}

function closesNext(text: string, from: number): boolean {
  let i = from
  while (i < text.length && /\s/.test(text[i])) i++
  return text[i] === '}' || text[i] === ']'
}

function withoutTrailingCommas(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      const end = stringEnd(text, i)
      out += text.slice(i, end + 1)
      i = end
    } else if (text[i] !== ',' || !closesNext(text, i + 1)) {
      out += text[i]
    }
  }
  return out
}

/** JSON with VS Code's comments and trailing commas; undefined when it does not parse. */
export function parseJsonc(text: string): unknown {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      const end = stringEnd(text, i)
      out += text.slice(i, end + 1)
      i = end
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
    } else {
      out += ch
    }
  }
  try {
    return JSON.parse(withoutTrailingCommas(out))
  } catch {
    return undefined
  }
}

function configDirIn(settings: unknown): string | null {
  if (!isRecord(settings)) return null
  const vars = settings['claudeCode.environmentVariables']
  if (!Array.isArray(vars)) return null
  const entry = vars.find((v): v is { name: string; value: string } => isRecord(v) && v.name === CONFIG_DIR_VAR && typeof v.value === 'string')
  const value = entry?.value.trim() ?? ''
  return value && isAbsolute(value) ? value : null
}

async function readJsonc(file: string): Promise<unknown> {
  try {
    return parseJsonc(await fs.readFile(file, 'utf-8'))
  } catch {
    return undefined
  }
}

function readStorage(userDir: string): Promise<unknown> {
  return readJsonc(join(userDir, 'globalStorage', 'storage.json'))
}

interface NamedProfile {
  name: string
  /** The profile reads the default profile's settings.json instead of its own. */
  sharesDefaultSettings: boolean
}

function namedProfiles(storage: unknown): Map<string, NamedProfile> {
  const names = new Map<string, NamedProfile>()
  const list = isRecord(storage) ? storage.userDataProfiles : undefined
  if (!Array.isArray(list)) return names
  for (const p of list) {
    if (!isRecord(p) || typeof p.location !== 'string' || typeof p.name !== 'string') continue
    const sharesDefaultSettings = isRecord(p.useDefaultFlags) && p.useDefaultFlags.settings === true
    names.set(p.location, { name: p.name, sharesDefaultSettings })
  }
  return names
}

async function profileNames(userDir: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const [location, p] of namedProfiles(await readStorage(userDir))) if (!p.sharesDefaultSettings) names.set(location, p.name)
  return names
}

async function profileFolders(userDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(join(userDir, 'profiles'), { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

/** Read-only: every VS Code profile whose Claude Code settings set CLAUDE_CONFIG_DIR. */
export async function readVsCodeConfigDirs(userDir: string): Promise<VsCodeConfigDir[]> {
  const names = await profileNames(userDir)
  const locations = [...new Set([...names.keys(), ...(await profileFolders(userDir))])]
  const sources = [
    { profileName: 'Default', file: join(userDir, 'settings.json') },
    ...locations.map((loc) => ({ profileName: names.get(loc) ?? loc, file: join(userDir, 'profiles', loc, 'settings.json') }))
  ]
  const found: VsCodeConfigDir[] = []
  for (const { profileName, file } of sources) {
    const configDir = configDirIn(await readJsonc(file))
    if (configDir) found.push({ profileName, configDir })
  }
  return found
}

/** VS Code's user folder; under the fake CLI only the one a test names in CC_VSCODE_USER_DIR. */
export function vscodeUserDir(env: Record<string, string | undefined> = process.env): string | null {
  if (env.CC_VSCODE_USER_DIR) return env.CC_VSCODE_USER_DIR
  if (env.CC_CLAUDE_BIN || !env.APPDATA) return null
  return join(env.APPDATA, 'Code', 'User')
}

/** The Windows folder a VS Code `file:` URI names; null for remote or malformed URIs. */
export function folderFromUri(uri: string): string | null {
  const match = /^file:\/\/([^/]*)(\/.*)?$/i.exec(uri)
  if (!match) return null
  let path: string
  try {
    path = decodeURIComponent(match[2] ?? '')
  } catch {
    return null
  }
  const host = match[1]
  if (host) return `\\\\${host}${path.replace(/\//g, '\\')}`
  return path.replace(/^\/(?=[a-z]:)/i, '').replace(/\//g, '\\')
}

export const DEFAULT_VSCODE_PROFILE = '__default__profile__'

/**
 * Read-only: each folder VS Code ties to a profile, with the Claude folder that profile runs on.
 * A profile that sets no CLAUDE_CONFIG_DIR runs on `defaultDir` (~/.claude).
 */
export async function readVsCodeFolderAccounts(userDir: string, defaultDir: string): Promise<VsCodeFolderAccount[]> {
  const storage = await readStorage(userDir)
  const associations = isRecord(storage) && isRecord(storage.profileAssociations) ? storage.profileAssociations.workspaces : undefined
  if (!isRecord(associations)) return []
  const profiles = namedProfiles(storage)
  const settingsDir = new Map<string, string | null>()
  const configDirOf = async (location: string): Promise<string> => {
    if (!settingsDir.has(location)) {
      const file = location === DEFAULT_VSCODE_PROFILE ? join(userDir, 'settings.json') : join(userDir, 'profiles', location, 'settings.json')
      settingsDir.set(location, configDirIn(await readJsonc(file)))
    }
    return settingsDir.get(location) ?? defaultDir
  }
  const found: VsCodeFolderAccount[] = []
  for (const [uri, location] of Object.entries(associations)) {
    const folder = folderFromUri(uri)
    if (!folder || typeof location !== 'string') continue
    if (location === DEFAULT_VSCODE_PROFILE) {
      found.push({ folder, profileName: 'Default', configDir: await configDirOf(DEFAULT_VSCODE_PROFILE) })
      continue
    }
    const profile = profiles.get(location)
    if (!profile) continue
    const configDir = await configDirOf(profile.sharesDefaultSettings ? DEFAULT_VSCODE_PROFILE : location)
    found.push({ folder, profileName: profile.name, configDir })
  }
  return found
}

