import { basename, dirname, join, resolve } from 'node:path'
import type { DiscoveredFolder, DiscoveredRepo, Workspace } from '../../shared/types'
import { deriveRepoGroup } from '../workspaces/repoGroup'
import { readBoard, type BoardFileReader } from './reader'

export interface DiscoveryDeps {
  files: BoardFileReader
  /** `git rev-parse --git-common-dir` as an absolute path, or null outside git. */
  commonDirOf: (path: string) => Promise<string | null>
}

export const DEFAULT_SCAN_ROOTS = ['C:\\projects', 'C:\\darkfall64']

const MAX_DEPTH = 3
const SKIPPED = new Set(['node_modules', 'library', 'temp'])

function pathKey(p: string): string {
  return resolve(p).replace(/[\\/]+$/, '').toLowerCase()
}

function skipped(name: string): boolean {
  return name.startsWith('.') || SKIPPED.has(name.toLowerCase())
}

async function hasFeature(repo: string, files: BoardFileReader): Promise<boolean> {
  const scratch = join(repo, '.scratch')
  for (const feature of await files.listDir(scratch).catch(() => [])) {
    if (!feature.isDirectory) continue
    const entries = await files.listDir(join(scratch, feature.name)).catch(() => [])
    if (entries.some((e) => (e.isDirectory ? e.name === 'issues' : e.name.toLowerCase() === 'spec.md'))) return true
  }
  return false
}

/** Git repo folders up to MAX_DEPTH below each root that hold at least one feature; never looks inside a repo except its .scratch. */
async function findRepoFolders(roots: string[], files: BoardFileReader): Promise<string[]> {
  const found: string[] = []
  const visit = async (dir: string, depth: number): Promise<void> => {
    const entries = await files.listDir(dir).catch(() => [])
    if (entries.some((e) => e.name === '.git')) {
      if (await hasFeature(dir, files)) found.push(dir)
      return
    }
    if (depth === MAX_DEPTH) return
    await Promise.all(
      entries.filter((e) => e.isDirectory && !skipped(e.name)).map((e) => visit(join(dir, e.name), depth + 1))
    )
  }
  await Promise.all(roots.map((root) => visit(root, 0)))
  return found
}

async function countsOf(path: string, files: BoardFileReader): Promise<Pick<DiscoveredFolder, 'featureCount' | 'openTicketCount'>> {
  const probe: Workspace = {
    id: path,
    name: basename(path),
    path,
    createdAt: 0,
    profileId: '',
    repoGroupKey: path,
    repoName: '',
    worktreeTag: ''
  }
  const features = (await readBoard([probe], files)).repoGroups.flatMap((g) => g.features)
  return {
    featureCount: features.filter((f) => f.state !== 'empty').length,
    openTicketCount: features.flatMap((f) => f.tickets).filter((t) => t.column !== 'done').length
  }
}

/** Main checkouts and worktrees that have tickets but aren't added yet, grouped by repo. */
export async function discoverRepos(roots: string[], added: Workspace[], deps: DiscoveryDeps): Promise<DiscoveredRepo[]> {
  const addedKeys = new Set(added.map((w) => pathKey(w.path)))
  const folders = (await findRepoFolders(roots, deps.files)).filter((p) => !addedKeys.has(pathKey(p)))
  const repos = new Map<string, DiscoveredRepo>()
  const located = await Promise.all(
    folders.map(async (path) => {
      const commonDir = await deps.commonDirOf(path)
      return commonDir === null ? null : { path, commonDir, ...(await countsOf(path, deps.files)) }
    })
  )
  for (const folder of located) {
    if (!folder) continue
    const group = deriveRepoGroup({ workspacePath: folder.path, gitCommonDir: folder.commonDir })
    const repo = repos.get(group.repoGroupKey) ?? {
      repoGroupKey: group.repoGroupKey,
      repoName: group.repoName,
      main: null,
      worktrees: []
    }
    repos.set(group.repoGroupKey, repo)
    const entry: DiscoveredFolder = {
      path: folder.path,
      worktreeTag: group.worktreeTag,
      featureCount: folder.featureCount,
      openTicketCount: folder.openTicketCount
    }
    const isMain = basename(folder.commonDir).toLowerCase() === '.git' && pathKey(dirname(folder.commonDir)) === pathKey(folder.path)
    if (isMain) repo.main = { ...entry, worktreeTag: '' }
    else repo.worktrees.push(entry)
  }
  const byPath = (a: DiscoveredFolder, b: DiscoveredFolder): number => a.path.localeCompare(b.path)
  for (const repo of repos.values()) repo.worktrees.sort(byPath)
  return [...repos.values()].sort(
    (a, b) => a.repoName.toLowerCase().localeCompare(b.repoName.toLowerCase()) || a.repoGroupKey.localeCompare(b.repoGroupKey)
  )
}
