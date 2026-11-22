import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { CONFIG_DIR_VAR } from '../../shared/profiles'
import type { VsCodeConfigDir } from '../../shared/types'

export type { VsCodeConfigDir }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function stringEnd(text: string, start: number): number {
  let i = start + 1
  for (; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
  return i
}

function withoutTrailingCommas(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      const end = stringEnd(text, i)
      out += text.slice(i, end + 1)
      i = end
    } else if (text[i] !== ',' || !/^\s*[}\]]/.test(text.slice(i + 1))) {
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
  const entry = vars.find((v) => isRecord(v) && v.name === CONFIG_DIR_VAR && typeof v.value === 'string')
  const value = isRecord(entry) ? (entry.value as string).trim() : ''
  return value && isAbsolute(value) ? value : null
}

async function readJsonc(file: string): Promise<unknown> {
  try {
    return parseJsonc(await fs.readFile(file, 'utf-8'))
  } catch {
    return undefined
  }
}

async function profileNames(userDir: string): Promise<Map<string, string>> {
  const storage = await readJsonc(join(userDir, 'globalStorage', 'storage.json'))
  const names = new Map<string, string>()
  const list = isRecord(storage) ? storage.userDataProfiles : undefined
  if (!Array.isArray(list)) return names
  for (const p of list) {
    if (!isRecord(p) || typeof p.location !== 'string' || typeof p.name !== 'string') continue
    if (isRecord(p.useDefaultFlags) && p.useDefaultFlags.settings === true) continue
    names.set(p.location, p.name)
  }
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
