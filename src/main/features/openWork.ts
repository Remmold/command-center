import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathKey } from '../../shared/findings'
import type { FeatureRecord } from '../../shared/features'
import type { MissingWorktree, OpenWorkItem, OpenWorkReport, OpenWorkSession, OpenWorkspaceReport } from '../../shared/openWork'
import type { Workspace } from '../../shared/types'
import { parseWorktreeList, type WorktreeEntry } from '../board/worktrees'

/** A workspace as the New feature dialog lists it: the workspace with its picker label. */
export type OpenWorkWorkspace = Pick<Workspace, 'id' | 'path' | 'profileId' | 'repoGroupKey'> & { label: string }

export interface OpenWorkDeps {
  /** Runs a read-only git command in `cwd`; rejects with the reason when it fails or times out. */
  git: (cwd: string, args: string[]) => Promise<string>
  /** The repo's main branch, as `createFeature` finds it; null when there is none. */
  mainBranch: (path: string) => Promise<string | null>
  pathExists: (path: string) => Promise<boolean>
  /** The Claude projects folder for `cwd` under the profile's config dir. */
  transcriptsDir: (profileId: string, cwd: string) => Promise<string>
  /** The files in a folder with their mtimes; empty when the folder is missing. */
  listFiles: (dir: string) => Promise<{ name: string; mtimeMs: number }[]>
  /** The main chat's folder; its workspace is kept out of the scan as it is out of every list. */
  mainChatDir: string
  now: () => number
}

const GIT_PREFIX = 'git:'
const HEADS = 'refs/heads/'

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err)).trim().split(/\r?\n/)[0]

const toNumber = (text: string): number => {
  const n = Number.parseInt(text.trim(), 10)
  return Number.isNaN(n) ? 0 : n
}

const unixMs = (text: string): number | null => {
  const s = Number.parseInt(text.trim(), 10)
  return Number.isNaN(s) ? null : s * 1000
}

async function lastSession(deps: OpenWorkDeps, profileId: string, cwd: string): Promise<OpenWorkSession | null> {
  const files = await deps.listFiles(await deps.transcriptsDir(profileId, cwd))
  let newest: OpenWorkSession | null = null
  for (const f of files) {
    if (!f.name.endsWith('.jsonl')) continue
    if (newest === null || f.mtimeMs > newest.mtime) newest = { id: f.name.slice(0, -'.jsonl'.length), mtime: f.mtimeMs }
  }
  return newest
}

/** Commits on `ref` that none of `bases` has; 0 means `ref` is fully merged. */
export const commitsAhead = async (git: OpenWorkDeps['git'], cwd: string, ref: string, bases: readonly string[]): Promise<number> =>
  toNumber(await git(cwd, ['rev-list', '--count', ref, '--not', ...bases]))

const aheadOf = (deps: OpenWorkDeps, cwd: string, ref: string, bases: readonly string[]): Promise<number> => commitsAhead(deps.git, cwd, ref, bases)

/** What work is measured against: main and, when it exists, origin's main, since a local main left behind its remote would count everything merged since as ahead. */
export async function mergeBases(git: OpenWorkDeps['git'], repoPath: string, main: string): Promise<string[]> {
  const remoteMain = `refs/remotes/origin/${main}`
  const hasRemote = await git(repoPath, ['rev-parse', '--verify', '--quiet', remoteMain]).then(
    () => true,
    () => false
  )
  return hasRemote ? [`${HEADS}${main}`, remoteMain] : [`${HEADS}${main}`]
}

/** Where Claude Code keeps its own agent worktrees inside a repo; they belong to a running session. */
export const agentWorktreesOf = (repoPath: string): string => `${pathKey(repoPath)}/.claude/worktrees/`

async function checkoutState(deps: OpenWorkDeps, path: string, bases: readonly string[]): Promise<{ lastCommitAt: number | null; ahead: number; dirty: boolean }> {
  const [date, ahead, status] = await Promise.all([
    deps.git(path, ['log', '-1', '--format=%ct', 'HEAD']),
    aheadOf(deps, path, 'HEAD', bases),
    deps.git(path, ['status', '--porcelain'])
  ])
  return { lastCommitAt: unixMs(date), ahead, dirty: status.trim() !== '' }
}

async function scanRepo(group: OpenWorkWorkspace[], features: readonly FeatureRecord[], deps: OpenWorkDeps): Promise<OpenWorkspaceReport> {
  const entries: WorktreeEntry[] = parseWorktreeList(await deps.git(group[0].path, ['worktree', 'list', '--porcelain']))
  const mainEntry = entries[0] && !entries[0].bare ? entries[0] : null
  const owner = (mainEntry && group.find((w) => pathKey(w.path) === pathKey(mainEntry.path))) || group[0]
  const repoPath = mainEntry ? resolve(mainEntry.path) : owner.path
  const report: OpenWorkspaceReport = { workspaceId: owner.id, label: owner.label, path: repoPath, mainBranch: null, items: [], missing: [], merged: [] }

  const main = await deps.mainBranch(repoPath)
  if (!main) return { ...report, error: 'no main or master branch' }
  report.mainBranch = main
  const bases = await mergeBases(deps.git, repoPath, main)
  const agentWorktrees = agentWorktreesOf(repoPath)

  const groupIds = new Set(group.map((w) => w.id))
  const trackedPaths = new Set(features.map((f) => pathKey(f.worktreePath)))
  const listedPaths = new Set(entries.map((e) => pathKey(e.path)))
  const featureBranches = new Set(
    features.filter((f) => groupIds.has(f.workspaceId) || (f.sourceWorkspaceId !== undefined && groupIds.has(f.sourceWorkspaceId)) || listedPaths.has(pathKey(f.worktreePath))).map((f) => f.branch)
  )
  const profileFor = (path: string): string => group.find((w) => pathKey(w.path) === pathKey(path))?.profileId ?? owner.profileId

  const missing: MissingWorktree[] = []
  const worktreeItems = entries.map(async (entry, i): Promise<OpenWorkItem | null> => {
    if (entry.bare || i === 0 || trackedPaths.has(pathKey(entry.path)) || pathKey(entry.path).startsWith(agentWorktrees)) return null
    const path = resolve(entry.path)
    if (entry.prunable || !(await deps.pathExists(path))) {
      missing.push({ path, branch: entry.branch })
      return null
    }
    const [state, session] = await Promise.all([checkoutState(deps, path, bases), lastSession(deps, profileFor(path), path)])
    return { kind: 'worktree', path, branch: entry.branch, ...state, session }
  })

  const mainItem = (async (): Promise<OpenWorkItem | null> => {
    if (!mainEntry || mainEntry.branch === main) return null
    const [state, session] = await Promise.all([checkoutState(deps, repoPath, bases), lastSession(deps, profileFor(repoPath), repoPath)])
    return { kind: 'main-checkout', path: repoPath, branch: mainEntry.branch, ...state, session }
  })()

  const checkedOut = new Set(entries.map((e) => e.branch).filter((b): b is string => b !== null))
  const heads = async (filters: string[]): Promise<{ branch: string; lastCommitAt: number | null }[]> =>
    (await deps.git(repoPath, ['for-each-ref', ...filters, '--format=%(refname)%09%(committerdate:unix)', HEADS]))
      .split(/\r?\n/)
      .filter((l) => l.startsWith(HEADS))
      .map((l) => {
        const [ref, date] = l.split('\t')
        return { branch: ref.slice(HEADS.length), lastCommitAt: unixMs(date ?? '') }
      })
  const [notMerged, allHeads] = await Promise.all([heads(bases.map((b) => `--no-merged=${b}`)), heads([])])
  // A branch housekeeping would delete: merged into a base, and nothing of the app's or git's still holds it.
  const anyFeatureBranch = new Set(features.map((f) => f.branch))
  const unmergedNames = new Set(notMerged.map((b) => b.branch))
  const merged = allHeads.filter((b) => !unmergedNames.has(b.branch) && b.branch !== main && !checkedOut.has(b.branch) && !anyFeatureBranch.has(b.branch))
  const unmerged = notMerged.filter((b) => b.branch !== main && !checkedOut.has(b.branch) && !featureBranches.has(b.branch))
  const branchItems = unmerged.map(async (b): Promise<OpenWorkItem | null> => {
    const ahead = await aheadOf(deps, repoPath, `${HEADS}${b.branch}`, bases)
    return ahead > 0 ? { kind: 'branch', ...b, ahead } : null
  })

  const items = await Promise.all([mainItem, ...worktreeItems, ...branchItems])
  return { ...report, items: items.filter((x): x is OpenWorkItem => x !== null), missing, merged }
}

/**
 * Finds the work in the workspaces' repos that no feature tracks: untracked worktrees, unmerged branches checked out
 * nowhere and main checkouts on another branch, measured against main and, when it exists, origin's main. Claude Code's own
 * agent worktrees (`.claude/worktrees/`) belong to a running session and are left out. Each repo is scanned once, in
 * parallel; a failure marks only its own report.
 */
export async function scanOpenWork(workspaces: readonly OpenWorkWorkspace[], features: readonly FeatureRecord[], deps: OpenWorkDeps): Promise<OpenWorkReport> {
  const groups = new Map<string, OpenWorkWorkspace[]>()
  for (const w of workspaces) {
    if (!w.repoGroupKey.startsWith(GIT_PREFIX) || pathKey(w.path) === pathKey(deps.mainChatDir)) continue
    groups.set(w.repoGroupKey, [...(groups.get(w.repoGroupKey) ?? []), w])
  }
  const reports = await Promise.all(
    [...groups.values()].map((group) =>
      scanRepo(group, features, deps).catch((err): OpenWorkspaceReport => ({
        workspaceId: group[0].id,
        label: group[0].label,
        path: group[0].path,
        mainBranch: null,
        items: [],
        missing: [],
        merged: [],
        error: message(err)
      }))
    )
  )
  return { scannedAt: deps.now(), workspaces: reports }
}

const GIT_TIMEOUT_MS = 20_000
const GIT_PARALLEL = 8
const MAX_BUFFER = 20 * 1024 * 1024

/** A git runner for the scan: read-only (`--no-optional-locks`), at most 8 at a time, each killed after `timeoutMs`. */
export function scanGit(timeoutMs = GIT_TIMEOUT_MS, parallel = GIT_PARALLEL): OpenWorkDeps['git'] {
  let running = 0
  const waiting: (() => void)[] = []
  const slot = async (): Promise<void> => {
    if (running < parallel) {
      running++
      return
    }
    await new Promise<void>((go) => waiting.push(go))
  }
  const release = (): void => {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
  return async (cwd, args) => {
    await slot()
    try {
      return await new Promise<string>((done, fail) => {
        execFile('git', ['--no-optional-locks', ...args], { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true }, (err, stdout, stderr) => {
          if (!err) return done(stdout)
          const killed = (err as { killed?: boolean }).killed
          fail(new Error(killed ? `git ${args[0]} timed out after ${timeoutMs / 1000} s` : stderr?.toString().trim() || err.message))
        })
      })
    } finally {
      release()
    }
  }
}

/** The transcripts in a folder with their mtimes, for `OpenWorkDeps.listFiles`; a missing folder, or a file gone meanwhile, lists nothing. */
export async function listTranscripts(dir: string): Promise<{ name: string; mtimeMs: number }[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const found = await Promise.all(
    names
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) =>
        fs.stat(join(dir, name)).then(
          (stat) => ({ name, mtimeMs: stat.mtimeMs }),
          () => null
        )
      )
  )
  return found.filter((f): f is { name: string; mtimeMs: number } => f !== null)
}
