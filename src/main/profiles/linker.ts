import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'

export const SHARED_ITEMS = [
  'CLAUDE.md',
  'settings.json',
  'skills',
  'plugins',
  'hooks',
  'agents',
  'commands',
  'projects'
] as const

const NEVER_SHARED = new Set(['.credentials.json', '.claude.json'])

export interface ProfileFolders {
  defaultDir: string
  profileDir: string
}

export interface LinkRepair {
  item: string
  action: 'linked' | 'relinked' | 'moved-aside' | 'failed'
  movedTo?: string
  error?: string
}

type Health = 'missing' | 'healthy' | 'broken-link' | 'occupied'

function samePath(a: string, b: string): boolean {
  const norm = (p: string): string =>
    resolve(p.replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out)
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) collectStrings(v, out)
}

/** Top-level entries of Default that its settings.json names by absolute path, e.g. a status line script. */
async function itemsNamedBySettings(defaultDir: string): Promise<string[]> {
  let settings: unknown
  try {
    settings = JSON.parse(await fs.readFile(join(defaultDir, 'settings.json'), 'utf-8'))
  } catch {
    return []
  }
  const strings: string[] = []
  collectStrings(settings, strings)
  const prefix = `${defaultDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`.toLowerCase()
  const found = new Set<string>()
  for (const raw of strings) {
    const text = raw.replace(/\\/g, '/')
    const lower = text.toLowerCase()
    for (let at = lower.indexOf(prefix); at !== -1; at = lower.indexOf(prefix, at + 1)) {
      const segment = /^[^/\s"'`]+/.exec(text.slice(at + prefix.length))?.[0]
      if (segment) found.add(segment)
    }
  }
  return [...found]
}

/** The fixed shared items plus whatever settings.json points at inside Default, minus the login and account file. */
export async function sharedItemsFor(defaultDir: string): Promise<string[]> {
  const items = new Set<string>([...SHARED_ITEMS, ...(await itemsNamedBySettings(defaultDir))])
  return [...items].filter(
    (item) => item !== '.' && item !== '..' && !NEVER_SHARED.has(item.toLowerCase())
  )
}

function stamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  )
}

async function lstatOrNull(path: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> {
  try {
    return await fs.lstat(path)
  } catch {
    return null
  }
}

async function junctionHealth(source: string, target: string): Promise<Health> {
  const stat = await lstatOrNull(target)
  if (!stat) return 'missing'
  if (!stat.isSymbolicLink()) return 'occupied'
  const pointsAt = await fs.readlink(target)
  return samePath(pointsAt, source) ? 'healthy' : 'broken-link'
}

async function hardLinkHealth(source: string, target: string): Promise<Health> {
  const stat = await lstatOrNull(target)
  if (!stat) return 'missing'
  const s = await fs.stat(source, { bigint: true })
  const t = await fs.stat(target, { bigint: true }).catch(() => null)
  return t && s.ino === t.ino && s.dev === t.dev ? 'healthy' : 'occupied'
}

/**
 * Links Default's shared items into the profile and repairs any that broke. Default stays the source
 * of truth: whatever sits where a link should be is moved aside, never deleted. The login and
 * account file are never in the list.
 */
export async function ensureProfileLinks(
  folders: ProfileFolders,
  now: Date = new Date()
): Promise<LinkRepair[]> {
  const repairs: LinkRepair[] = []
  for (const item of await sharedItemsFor(folders.defaultDir)) {
    const source = join(folders.defaultDir, item)
    let sourceStat
    try {
      sourceStat = await fs.stat(source)
    } catch {
      continue
    }
    const target = join(folders.profileDir, item)
    const isDir = sourceStat.isDirectory()
    const link = (): Promise<void> =>
      isDir ? fs.symlink(source, target, 'junction') : fs.link(source, target)
    try {
      const health = isDir ? await junctionHealth(source, target) : await hardLinkHealth(source, target)
      if (health === 'healthy') continue
      if (health === 'missing') {
        await link()
        repairs.push({ item, action: 'linked' })
      } else if (health === 'broken-link') {
        await fs.unlink(target)
        await link()
        repairs.push({ item, action: 'relinked' })
      } else {
        const movedTo = `${target}.unlinked-${stamp(now)}`
        await fs.rename(target, movedTo)
        await link()
        repairs.push({ item, action: 'moved-aside', movedTo })
      }
    } catch (err) {
      repairs.push({ item, action: 'failed', error: (err as Error).message })
    }
  }
  return repairs
}
