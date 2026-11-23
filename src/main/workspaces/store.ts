import { promises as fs } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PROFILE_ID, type Workspace } from '../../shared/types'
import { projectsFile } from '../util/paths'
import { getCommonDir } from '../git/service'
import { deriveRepoGroup } from './repoGroup'
import { inOrder, toEnd } from './order'

type SavedWorkspace = Pick<Workspace, 'id' | 'name' | 'path' | 'createdAt'> &
  Partial<Pick<Workspace, 'profileId' | 'repoGroupKey'>>

function isSaved(x: unknown): x is SavedWorkspace {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.path === 'string' &&
    typeof p.createdAt === 'number' &&
    (p.profileId === undefined || typeof p.profileId === 'string')
  )
}

function toSaved(w: Workspace): SavedWorkspace {
  return {
    id: w.id,
    name: w.name,
    path: w.path,
    createdAt: w.createdAt,
    profileId: w.profileId,
    repoGroupKey: w.repoGroupKey
  }
}

function isStale(saved: SavedWorkspace, current: Workspace): boolean {
  return saved.profileId !== current.profileId || saved.repoGroupKey !== current.repoGroupKey
}

let queue: Promise<unknown> = Promise.resolve()

/** Runs store operations one at a time so a list's write-back never overwrites a concurrent add or remove. */
function serial<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op)
  queue = next.catch(() => undefined)
  return next
}

async function toWorkspace(saved: SavedWorkspace): Promise<Workspace> {
  const group = deriveRepoGroup({
    workspacePath: saved.path,
    gitCommonDir: await getCommonDir(saved.path)
  })
  return {
    id: saved.id,
    name: saved.name,
    path: saved.path,
    createdAt: saved.createdAt,
    profileId: saved.profileId ?? DEFAULT_PROFILE_ID,
    ...group
  }
}

async function readAll(): Promise<SavedWorkspace[]> {
  try {
    const raw = await fs.readFile(projectsFile(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSaved)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeAll(workspaces: SavedWorkspace[]): Promise<void> {
  const file = projectsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(workspaces, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

/** Repo groups are re-derived on every list, so a folder that becomes a git worktree regroups itself. */
export function list(): Promise<Workspace[]> {
  return serial(async () => {
    const saved = await readAll()
    const workspaces = await Promise.all(saved.map(toWorkspace))
    if (saved.some((s, i) => isStale(s, workspaces[i]))) await writeAll(workspaces.map(toSaved))
    return workspaces
  })
}

/** `profileId` is the account a new workspace starts on; an existing workspace keeps its own. */
export function add(path: string, profileId: string = DEFAULT_PROFILE_ID): Promise<Workspace> {
  return serial(async () => {
    const saved = await readAll()
    const existing = saved.find((p) => samePath(p.path, path))
    if (existing) return toWorkspace(existing)
    const workspace = await toWorkspace({
      id: randomUUID(),
      name: basename(path) || path,
      path,
      createdAt: Date.now(),
      profileId
    })
    await writeAll([...saved, toSaved(workspace)])
    return workspace
  })
}

export function remove(id: string): Promise<void> {
  return serial(async () => {
    const saved = await readAll()
    await writeAll(saved.filter((p) => p.id !== id))
  })
}

export function setProfile(id: string, profileId: string): Promise<Workspace | null> {
  return serial(async () => {
    const saved = await readAll()
    const target = saved.find((p) => p.id === id)
    if (!target) return null
    const moved = target.profileId !== profileId
    target.profileId = profileId
    await writeAll(moved ? toEnd(saved, id) : saved)
    return toWorkspace(target)
  })
}

/** Saves the order Settings shows; it is the order every list of workspaces follows. */
export function reorder(ids: readonly string[]): Promise<Workspace[]> {
  return serial(async () => {
    const saved = inOrder(await readAll(), ids)
    await writeAll(saved)
    return Promise.all(saved.map(toWorkspace))
  })
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => resolve(p).replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** The workspace whose folder is exactly `path`, compared the way Windows compares paths. */
export function findByPath(path: string): Promise<Workspace | undefined> {
  return serial(async () => {
    const match = (await readAll()).find((p) => samePath(p.path, path))
    return match ? toWorkspace(match) : undefined
  })
}
