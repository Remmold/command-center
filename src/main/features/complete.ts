import { execFile } from 'node:child_process'
import type { FeatureRecord } from '../../shared/features'
import type { PreviewConfig } from '../../shared/previewConfig'
import type { PortsResult } from './ports'

export type Outcome = { ok: true } | { ok: false; error: string }

const fail = (error: string): Outcome => ({ ok: false, error })
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export interface CompleteDeps {
  feature: (name: string) => Promise<FeatureRecord | undefined>
  runner: { stop: (name: string) => Promise<void>; remove: (name: string) => Promise<void> }
  /** Closes both windows and drops the browser store. */
  closePair: (name: string) => Promise<void>
  setPorts: (name: string, ports: number[], portNames: string[]) => Promise<void>
  /** Sets the completed time; null re-opens the feature. */
  setCompleted: (name: string, at: number | null) => Promise<void>
  now: () => number
}

/** Stops the servers and forgets them, closes the pair and its browser store, frees the ports, then marks the feature Completed. The worktree and branch are never touched. */
export async function completeFeature(deps: CompleteDeps, name: string): Promise<Outcome> {
  const feature = await deps.feature(name)
  if (!feature) return fail(`The feature ${name} is not known.`)
  if (feature.completedAt !== null) return fail(`${name} is already completed.`)
  try {
    await deps.runner.stop(name)
    await deps.runner.remove(name)
    await deps.closePair(name)
    await deps.setPorts(name, [], [])
    await deps.setCompleted(name, deps.now())
  } catch (err) {
    return fail(`Could not complete ${name}: ${reason(err)}`)
  }
  return { ok: true }
}

export interface ReopenDeps {
  feature: CompleteDeps['feature']
  config: (feature: FeatureRecord) => Promise<PreviewConfig | null>
  /** Reserves one free port per server name, as the Test button does. */
  reservePorts: (name: string, servers: string[]) => Promise<PortsResult>
  setPorts: CompleteDeps['setPorts']
  setCompleted: CompleteDeps['setCompleted']
}

/** A completed feature returns to its stage with fresh ports; when none can be had it stays completed. */
export async function reopenFeature(deps: ReopenDeps, name: string): Promise<Outcome> {
  const feature = await deps.feature(name)
  if (!feature) return fail(`The feature ${name} is not known.`)
  if (feature.completedAt === null) return fail(`${name} is not completed.`)
  await deps.setCompleted(name, null)
  const servers = ((await deps.config(feature).catch(() => null))?.servers ?? []).map((s) => s.name)
  if (servers.length === 0) return { ok: true }
  const reserved = await deps.reservePorts(name, servers)
  if (reserved.ok) return { ok: true }
  await deps.setPorts(name, [], [])
  await deps.setCompleted(name, feature.completedAt)
  return fail(reserved.error)
}

/** Runs git in `cwd`; rejects with git's own message. */
export function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(stderr.toString().trim() || err.message)) : resolve(stdout)))
  })
}

/** Commits on `branch` that `base` does not have. */
export async function commitsBeyond(repo: string, branch: string, base: string): Promise<number> {
  return Number((await runGit(repo, ['rev-list', '--count', `${base}..${branch}`])).trim())
}

/** `git worktree remove` without force, so a worktree with uncommitted changes is refused. The branch stays. */
export async function removeWorktreeOnly(repo: string, path: string): Promise<void> {
  await runGit(repo, ['worktree', 'remove', path])
  await runGit(repo, ['worktree', 'prune']).catch(() => undefined)
}

export interface RemoveWorktreeDeps {
  feature: CompleteDeps['feature']
  /** The checkout the worktree belongs to and its main branch; null when none is found. */
  repo: (feature: FeatureRecord) => Promise<{ path: string; base: string } | null>
  commitsBeyond: (repo: string, branch: string, base: string) => Promise<number>
  removeWorktree: (repo: string, path: string) => Promise<void>
  /** Drops the worktree's workspace and the feature record. */
  forget: (feature: FeatureRecord) => Promise<void>
}

/** Removes a completed feature's worktree, never while its branch holds commits the main branch lacks. */
export async function removeFeatureWorktree(deps: RemoveWorktreeDeps, name: string): Promise<Outcome> {
  const feature = await deps.feature(name)
  if (!feature) return fail(`The feature ${name} is not known.`)
  if (feature.completedAt === null) return fail(`Complete ${name} before removing its worktree.`)
  const repo = await deps.repo(feature)
  if (!repo) return fail(`The checkout ${name} was made from was not found, so its worktree cannot be removed safely.`)
  try {
    const ahead = await deps.commitsBeyond(repo.path, feature.branch, repo.base)
    if (ahead > 0) return fail(`${feature.branch} has ${ahead} commit${ahead === 1 ? '' : 's'} that ${repo.base} does not; merge it first.`)
    await deps.removeWorktree(repo.path, feature.worktreePath)
    await deps.forget(feature)
  } catch (err) {
    return fail(`Could not remove the worktree: ${reason(err)}`)
  }
  return { ok: true }
}
