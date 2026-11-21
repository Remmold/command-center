import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PROFILE_ID, type AccountProfile } from '../../shared/types'
import { profileEnv } from '../../shared/profiles'
import { userDataPath } from '../util/paths'
import { ensureProfileLinks } from './linker'
import { harnessConfigDir } from '../pty/claude-locator'

interface SavedProfile {
  id: string
  name: string
  createdAt: number
}

export function defaultConfigDir(): string {
  return harnessConfigDir() ?? join(homedir(), '.claude')
}

function profilesFile(): string {
  return userDataPath('profiles.json')
}

function configDirFor(id: string): string {
  return id === DEFAULT_PROFILE_ID ? defaultConfigDir() : userDataPath('profiles', id)
}

function isSaved(x: unknown): x is SavedProfile {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.createdAt === 'number'
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

async function toProfile(saved: Pick<SavedProfile, 'id' | 'name'>): Promise<AccountProfile> {
  const configDir = configDirFor(saved.id)
  let loggedIn = true
  try {
    await fs.access(join(configDir, '.credentials.json'))
  } catch {
    loggedIn = false
  }
  return { id: saved.id, name: saved.name, configDir, loggedIn }
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('a profile needs a name')
  return trimmed
}

async function linkFromDefault(profile: AccountProfile): Promise<void> {
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

/** Repairs the profile's links; returns the profile a session actually runs on and the variables it needs. */
export async function prepareSession(
  profileId: string
): Promise<{ profileId: string; env: Record<string, string> }> {
  const profile = await get(profileId)
  if (profile.id !== DEFAULT_PROFILE_ID) {
    try {
      await linkFromDefault(profile)
    } catch (err) {
      console.error('[profiles] link check failed', profile.name, err)
    }
  }
  return { profileId: profile.id, env: profileEnv(profile) }
}
