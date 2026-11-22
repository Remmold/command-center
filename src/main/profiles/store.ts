import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PROFILE_ID, type AccountProfile, type AdoptResult } from '../../shared/types'
import { profileEnv } from '../../shared/profiles'
import { userDataPath } from '../util/paths'
import { ensureProfileLinks } from './linker'
import { harnessConfigDir } from '../pty/claude-locator'
import { adoptionProblem, adoptedName, linksAllowed, removeSaved, suggestionsFrom, type PathKind, type SavedProfile } from './adopt'
import { readVsCodeConfigDirs, vscodeUserDir, type VsCodeConfigDir } from './vscodeProfiles'

export function defaultConfigDir(): string {
  return harnessConfigDir() ?? join(homedir(), '.claude')
}

function profilesFile(): string {
  return userDataPath('profiles.json')
}

function appProfilesRoot(): string {
  return userDataPath('profiles')
}

function configDirFor(saved: Pick<SavedProfile, 'id' | 'configDir'>): string {
  if (saved.id === DEFAULT_PROFILE_ID) return defaultConfigDir()
  return saved.configDir ?? join(appProfilesRoot(), saved.id)
}

function isSaved(x: unknown): x is SavedProfile {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.createdAt === 'number' &&
    (p.configDir === undefined || typeof p.configDir === 'string')
  )
}

let queue: Promise<unknown> = Promise.resolve()

function serial<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op)
  queue = next.catch(() => undefined)
  return next
}

async function readAll(): Promise<SavedProfile[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(profilesFile(), 'utf-8'))
    return Array.isArray(parsed) ? parsed.filter(isSaved) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeAll(profiles: SavedProfile[]): Promise<void> {
  const file = profilesFile()
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(`${file}.tmp`, JSON.stringify(profiles, null, 2), 'utf-8')
  await fs.rename(`${file}.tmp`, file)
}

async function toProfile(saved: Pick<SavedProfile, 'id' | 'name' | 'configDir'>): Promise<AccountProfile> {
  const configDir = configDirFor(saved)
  let loggedIn = true
  try {
    await fs.access(join(configDir, '.credentials.json'))
  } catch {
    loggedIn = false
  }
  return { id: saved.id, name: saved.name, configDir, loggedIn, adopted: saved.configDir !== undefined }
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('a profile needs a name')
  return trimmed
}

async function linkFromDefault(profile: AccountProfile): Promise<void> {
  if (!linksAllowed(profile)) return
  await fs.mkdir(profile.configDir, { recursive: true })
  const repairs = await ensureProfileLinks({
    defaultDir: defaultConfigDir(),
    profileDir: profile.configDir
  })
  for (const r of repairs) console.log('[profiles] repair', profile.name, r)
}

export function list(): Promise<AccountProfile[]> {
  return serial(async () => {
    const saved = await readAll()
    return Promise.all([{ id: DEFAULT_PROFILE_ID, name: 'Default' }, ...saved].map(toProfile))
  })
}

/** An unknown id (a deleted profile) falls back to Default. */
export async function get(id: string): Promise<AccountProfile> {
  const profiles = await list()
  return profiles.find((p) => p.id === id) ?? profiles[0]
}

export function create(name: string): Promise<AccountProfile> {
  return serial(async () => {
    const saved: SavedProfile = { id: randomUUID(), name: cleanName(name), createdAt: Date.now() }
    const profile = await toProfile(saved)
    await linkFromDefault(profile)
    await writeAll([...(await readAll()), saved])
    return profile
  })
}

export function rename(id: string, name: string): Promise<AccountProfile | null> {
  return serial(async () => {
    const saved = await readAll()
    const target = saved.find((p) => p.id === id)
    if (!target) return null
    target.name = cleanName(name)
    await writeAll(saved)
    return toProfile(target)
  })
}

async function pathKind(path: string): Promise<PathKind> {
  try {
    return (await fs.stat(path)).isDirectory() ? 'folder' : 'file'
  } catch {
    return 'missing'
  }
}

async function vscodeFolders(): Promise<VsCodeConfigDir[]> {
  const dir = vscodeUserDir()
  return dir ? readVsCodeConfigDirs(dir) : []
}

/** Folders VS Code profiles point Claude Code at that exist and no profile uses yet. */
export async function suggestions(): Promise<VsCodeConfigDir[]> {
  const offered = suggestionsFrom(await vscodeFolders(), await list())
  const kinds = await Promise.all(offered.map((s) => pathKind(s.configDir)))
  return offered.filter((_, i) => kinds[i] === 'folder')
}

/** Adds a profile on an existing folder; the folder itself is only read, never written to. */
export async function adopt(path: string): Promise<AdoptResult> {
  const found = await vscodeFolders()
  const kind = await pathKind(path)
  return serial(async () => {
    const used = await Promise.all([{ id: DEFAULT_PROFILE_ID, name: 'Default' }, ...(await readAll())].map(toProfile))
    const error = adoptionProblem({ path, kind, used, appProfilesRoot: appProfilesRoot() })
    if (error) return { ok: false, error }
    const saved: SavedProfile = { id: randomUUID(), name: adoptedName(path, found), createdAt: Date.now(), configDir: path }
    await writeAll([...(await readAll()), saved])
    return { ok: true, profile: await toProfile(saved) }
  })
}

/** Forgets the profile. Its folder is left exactly as it is. */
export function remove(id: string): Promise<boolean> {
  return serial(async () => {
    const saved = await readAll()
    const kept = removeSaved(saved, id)
    if (kept.length === saved.length) return false
    await writeAll(kept)
    return true
  })
}

/** Repairs the profile's links; returns the profile a session actually runs on and the variables it needs. */
export async function prepareSession(
  profileId: string
): Promise<{ profileId: string; env: Record<string, string> }> {
  const profile = await get(profileId)
  if (linksAllowed(profile)) {
    try {
      await linkFromDefault(profile)
    } catch (err) {
      console.error('[profiles] link check failed', profile.name, err)
    }
  }
  return { profileId: profile.id, env: profileEnv(profile, harnessConfigDir()) }
}
