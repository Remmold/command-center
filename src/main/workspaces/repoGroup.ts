import { posix, win32 } from 'node:path'

export interface RepoGroupInput {
  workspacePath: string
  /** `git rev-parse --git-common-dir` for the workspace, or null outside git. */
  gitCommonDir: string | null
}

export interface RepoGroup {
  repoGroupKey: string
  repoName: string
  worktreeTag: string
}

const SEPARATORS = /^[-_. ]+/

function toPosix(p: string): string {
  const slashed = p.replace(/\\/g, '/')
  const normal = posix.normalize(slashed)
  return normal.length > 1 && normal.endsWith('/') ? normal.slice(0, -1) : normal
}

/** Folder paths on Windows are case-insensitive, so keys compare lowercased. */
function keyOf(p: string): string {
  return p.toLowerCase()
}

function repoNameFromCommonDir(commonDir: string): string {
  const base = posix.basename(commonDir)
  if (base.toLowerCase() === '.git') return posix.basename(posix.dirname(commonDir))
  return base.replace(/\.git$/i, '')
}

function initials(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_. ]+/)
    .filter(Boolean)
  return words.length < 2 ? '' : words.map((w) => w[0]).join('')
}

/** Rest of the folder name after `prefix` and its separators, or null when it doesn't start with it as a whole word. */
function afterPrefix(folder: string, prefix: string): string | null {
  if (!prefix || !folder.toLowerCase().startsWith(prefix.toLowerCase())) return null
  const rest = folder.slice(prefix.length)
  if (rest !== '' && !SEPARATORS.test(rest)) return null
  return rest.replace(SEPARATORS, '')
}

function worktreeTag(folder: string, repoName: string): string {
  const afterName = afterPrefix(folder, repoName)
  if (afterName !== null) return afterName
  const afterInitials = afterPrefix(folder, initials(repoName))
  return afterInitials || folder
}

export function deriveRepoGroup({ workspacePath, gitCommonDir }: RepoGroupInput): RepoGroup {
  const workspace = toPosix(workspacePath)
  const folder = posix.basename(workspace)
  if (gitCommonDir === null) {
    return { repoGroupKey: `dir:${keyOf(workspace)}`, repoName: folder, worktreeTag: '' }
  }
  const raw = toPosix(gitCommonDir)
  const commonDir = win32.isAbsolute(raw) ? raw : posix.join(workspace, raw)
  const repoName = repoNameFromCommonDir(commonDir)
  return {
    repoGroupKey: `git:${keyOf(commonDir)}`,
    repoName,
    worktreeTag: worktreeTag(folder, repoName)
  }
}
