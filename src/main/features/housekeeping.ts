import { resolve } from 'node:path'
import type { FeatureRecord } from '../../shared/features'
import { pathKey } from '../../shared/findings'
import type { HousekeepingCheck, HousekeepingItemResult, HousekeepingPlan, HousekeepingRequest, HousekeepingRun, HousekeepingSkip } from '../../shared/housekeeping'
import type { Workspace } from '../../shared/types'
import { parseWorktreeList, type WorktreeEntry } from '../board/worktrees'
import type { Outcome } from './complete'
import { agentWorktreesOf, commitsAhead, mergeBases } from './openWork'

export interface HousekeepingDeps {
  workspaces: () => Promise<Workspace[]>
  features: () => Promise<FeatureRecord[]>
  /** Read-only git for the checks; rejects with git's message. */
  read: (cwd: string, args: string[]) => Promise<string>
  /** Git for the actions themselves; only `worktree remove` and `branch -d` are ever run through it. */
  write: (cwd: string, args: string[]) => Promise<string>
  mainBranch: (path: string) => Promise<string | null>
  pathExists: (path: string) => Promise<boolean>
  /** The Complete button's own action. */
  complete: (name: string) => Promise<Outcome>
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err)).trim().split(/\r?\n/)[0]
const commits = (n: number, main: string): string => `${n} commit${n === 1 ? '' : 's'} not merged into ${main}`

interface Repo {
  mainPath: string
  main: string
  bases: string[]
  entries: WorktreeEntry[]
}

async function repoOf(deps: HousekeepingDeps, path: string): Promise<Repo | string> {
  const entries = parseWorktreeList(await deps.read(path, ['worktree', 'list', '--porcelain']))
  if (!entries[0] || entries[0].bare) return 'its repo has no main checkout'
  const mainPath = resolve(entries[0].path)
  const main = await deps.mainBranch(mainPath)
  if (!main) return 'its repo has no main or master branch'
  return { mainPath, main, bases: await mergeBases(deps.read, mainPath, main), entries }
}

type Check = (item: string) => Promise<string | null>

function worktreeChecks(deps: HousekeepingDeps, repo: Repo, features: readonly FeatureRecord[], workspaces: readonly Workspace[]): Check {
  const agentWorktrees = agentWorktreesOf(repo.mainPath)
  return async (item) => {
    const index = repo.entries.findIndex((e) => pathKey(e.path) === pathKey(item))
    if (index < 0) return 'not a worktree of this repo'
    if (index === 0) return 'the main checkout'
    const feature = features.find((f) => pathKey(f.worktreePath) === pathKey(item))
    if (feature) return `the worktree of the feature ${feature.name}`
    if (pathKey(item).startsWith(agentWorktrees)) return "a Claude Code agent worktree, in use by its session"
    if (workspaces.some((w) => pathKey(w.path) === pathKey(item))) return 'a workspace in Command Center; remove the workspace in Settings first'
    if (repo.entries[index].prunable || !(await deps.pathExists(item))) return 'its folder is gone; prune it instead'
    if ((await deps.read(item, ['status', '--porcelain'])).trim() !== '') return 'uncommitted changes'
    const ahead = await commitsAhead(deps.read, item, 'HEAD', repo.bases)
    return ahead > 0 ? commits(ahead, repo.main) : null
  }
}

function branchChecks(deps: HousekeepingDeps, repo: Repo, features: readonly FeatureRecord[]): Check {
  return async (item) => {
    if (/^(refs\/)?remotes\/|^origin\//.test(item)) return 'a remote branch; remote branches are never deleted'
    const exists = await deps.read(repo.mainPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${item}`]).then(
      () => true,
      () => false
    )
    if (!exists) return 'no local branch by that name'
    if (item === repo.main) return 'the main branch'
    const out = repo.entries.find((e) => e.branch === item)
    if (out) return `checked out in ${resolve(out.path)}`
    const feature = features.find((f) => f.branch === item)
    if (feature) return `the branch of the feature ${feature.name}`
    const ahead = await commitsAhead(deps.read, repo.mainPath, `refs/heads/${item}`, repo.bases)
    return ahead > 0 ? commits(ahead, repo.main) : null
  }
}

function pruneChecks(deps: HousekeepingDeps, repo: Repo): Check {
  return async (item) => {
    const index = repo.entries.findIndex((e) => pathKey(e.path) === pathKey(item))
    if (index < 0) return 'not a worktree git lists'
    if (index === 0) return 'the main checkout'
    if (!repo.entries[index].prunable && (await deps.pathExists(item))) return 'its folder still exists'
    return null
  }
}

function completeChecks(features: readonly FeatureRecord[]): Check {
  return async (item) => {
    const named = features.filter((f) => f.name === item)
    if (named.length === 0) return `no feature named ${item}`
    if (named.length > 1) return `${named.length} features are named ${item}`
    return named[0].completedAt !== null ? 'already completed' : null
  }
}

async function plan(deps: HousekeepingDeps, request: HousekeepingRequest): Promise<{ ok: true; plan: HousekeepingPlan; repo: Repo | null } | { ok: false; error: string }> {
  const [workspaces, features] = await Promise.all([deps.workspaces(), deps.features()])
  const workspace = workspaces.find((w) => w.id === request.workspaceId)
  if (!workspace) return fail('That workspace no longer exists.')
  if (request.items.length === 0) return fail('The card lists no items.')
  let repo: Repo | null = null
  let check: Check
  if (request.action === 'complete-feature') check = completeChecks(features)
  else {
    const found = await repoOf(deps, workspace.path).catch((err: unknown) => `git failed: ${reason(err)}`)
    if (typeof found === 'string') return fail(`${workspace.name} cannot be tidied: ${found}.`)
    repo = found
    if (request.action === 'remove-merged-worktrees') check = worktreeChecks(deps, repo, features, workspaces)
    else if (request.action === 'delete-merged-branches') check = branchChecks(deps, repo, features)
    else check = pruneChecks(deps, repo)
  }
  const will: string[] = []
  const skip: HousekeepingSkip[] = []
  for (const item of request.items) {
    const why = await check(item).catch((err: unknown) => `could not be checked (${reason(err)})`)
    if (why === null) will.push(item)
    else skip.push({ item, reason: why })
  }
  return { ok: true, plan: { will, skip }, repo }
}

/** Checks every item of the card now, as the card shows it; nothing is changed. */
export async function checkHousekeeping(deps: HousekeepingDeps, request: HousekeepingRequest): Promise<HousekeepingCheck> {
  const planned = await plan(deps, request)
  return planned.ok ? { ok: true, plan: planned.plan } : planned
}

/**
 * Checks every item again, then does exactly the items that pass, one by one, each failure kept to its own item:
 * `git worktree remove` without `--force` (also for a missing folder, so only the listed entries are pruned), `git
 * branch -d`, never `-D`, or the Complete button's action.
 */
export async function runHousekeeping(deps: HousekeepingDeps, request: HousekeepingRequest): Promise<HousekeepingRun> {
  const planned = await plan(deps, request)
  if (!planned.ok) return planned
  const { plan: { will, skip }, repo } = planned
  const results: HousekeepingItemResult[] = []
  for (const item of will) {
    try {
      if (request.action === 'complete-feature') {
        const done = await deps.complete(item)
        results.push(done.ok ? { item, ok: true } : { item, ok: false, error: done.error })
        continue
      }
      const cwd = (repo as Repo).mainPath
      if (request.action === 'delete-merged-branches') await deps.write(cwd, ['branch', '-d', item])
      else await deps.write(cwd, ['worktree', 'remove', item])
      results.push({ item, ok: true })
    } catch (err) {
      results.push({ item, ok: false, error: reason(err) })
    }
  }
  return { ok: true, results, skipped: skip }
}
