import { basename, join, posix, resolve } from 'node:path'
import type { Workspace } from '../../shared/types'
import type { BoardFileReader, ExtraCopy } from './reader'

export interface WorktreeEntry {
  path: string
  /** Short branch name; null when detached or bare. */
  branch: string | null
  bare: boolean
  prunable: boolean
}

export interface ExtraWorktree {
  path: string
  worktreeTag: string
}

const BRANCH_PREFIX = 'refs/heads/'

export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: WorktreeEntry | null = null
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null, bare: false, prunable: false }
      entries.push(current)
    } else if (!current) {
      continue
    } else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length)
      current.branch = ref.startsWith(BRANCH_PREFIX) ? ref.slice(BRANCH_PREFIX.length) : ref
    } else if (line === 'bare') {
      current.bare = true
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true
    }
  }
  return entries
}

function cleanPath(p: string): string {
  return resolve(p).replace(/[\\/]+$/, '')
}

function pathKey(p: string): string {
  return cleanPath(p).toLowerCase()
}

/** Worktrees to read as extra copies: not prunable, not bare, not an added workspace, each once. Git lists the main checkout first; it gets no tag. */
export function pickExtraWorktrees(entries: WorktreeEntry[], addedPaths: string[]): ExtraWorktree[] {
  const seen = new Set(addedPaths.map(pathKey))
  const mainKey = entries[0] && !entries[0].bare ? pathKey(entries[0].path) : null
  const extras: ExtraWorktree[] = []
  for (const entry of entries) {
    if (entry.bare || entry.prunable) continue
    const key = pathKey(entry.path)
    if (seen.has(key)) continue
    seen.add(key)
    const path = cleanPath(entry.path)
    extras.push({ path, worktreeTag: key === mainKey ? '' : (entry.branch ?? basename(path)) })
  }
  return extras
}

export const WORKTREE_LIST_TTL_MS = 30_000
const GIT_KEY_PREFIX = 'git:'

export interface WorktreeListerDeps {
  /** `git worktree list --porcelain` in `cwd`, or null when git fails; must be read-only. */
  listPorcelain: (cwd: string) => Promise<string | null>
  files: BoardFileReader
  now?: () => number
}

/** The main checkout for a repo group key (`git:<common dir>`), else the bare repo itself; an added workspace's spelling wins. */
function mainCheckoutOf(repoGroupKey: string, workspaces: Workspace[]): string {
  const commonDir = repoGroupKey.slice(GIT_KEY_PREFIX.length)
  const main = posix.basename(commonDir) === '.git' ? posix.dirname(commonDir) : commonDir
  return workspaces.find((w) => pathKey(w.path) === pathKey(main))?.path ?? resolve(main)
}

async function hasScratch(path: string, files: BoardFileReader): Promise<boolean> {
  try {
    return (await files.listDir(join(path, '.scratch'))).length > 0
  } catch {
    return false
  }
}

/** Lists each added repo's worktrees from its main checkout, at most once per 30 s per repo. */
export function createWorktreeLister({ listPorcelain, files, now = Date.now }: WorktreeListerDeps) {
  const cache = new Map<string, { at: number; entries: WorktreeEntry[] }>()

  const entriesOf = async (repoGroupKey: string, group: Workspace[], fresh: boolean): Promise<WorktreeEntry[]> => {
    const known = cache.get(repoGroupKey)
    if (!fresh && known && now() - known.at < WORKTREE_LIST_TTL_MS) return known.entries
    const porcelain = await listPorcelain(mainCheckoutOf(repoGroupKey, group))
    const entries = porcelain === null ? [] : parseWorktreeList(porcelain)
    cache.set(repoGroupKey, { at: now(), entries })
    return entries
  }

  return {
    /** Worktrees that aren't added, exist and have a `.scratch`, for every git repo among `workspaces`; `fresh` skips the cache. */
    async extras(workspaces: Workspace[], fresh = false): Promise<ExtraCopy[]> {
      const groups = new Map<string, Workspace[]>()
      for (const w of workspaces) {
        if (!w.repoGroupKey.startsWith(GIT_KEY_PREFIX)) continue
        groups.set(w.repoGroupKey, [...(groups.get(w.repoGroupKey) ?? []), w])
      }
      for (const key of cache.keys()) if (!groups.has(key)) cache.delete(key)
      const added = workspaces.map((w) => w.path)
      const perGroup = await Promise.all(
        [...groups].map(async ([repoGroupKey, group]) => {
          const picked = pickExtraWorktrees(await entriesOf(repoGroupKey, group, fresh), added)
          const present = await Promise.all(picked.map((e) => hasScratch(e.path, files)))
          return picked.filter((_, i) => present[i]).map((e) => ({ repoGroupKey, ...e }))
        })
      )
      return perGroup.flat()
    }
  }
}
