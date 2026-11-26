import { basename, dirname, join } from 'node:path'
import { nameProblem } from '../../shared/featureName'
import type { FeatureRecord, NewFeatureRequest, NewFeatureResult } from '../../shared/features'
import type { Workspace } from '../../shared/types'
import { flowProblem } from './flowProblem'

export interface CreateDeps {
  git: {
    isRepo: (path: string) => Promise<boolean>
    mainBranch: (path: string) => Promise<string | null>
    branchTaken: (path: string, branch: string) => Promise<boolean>
    addWorktree: (repo: string, path: string, branch: string, base: string) => Promise<void>
    removeNewWorktree: (repo: string, path: string, branch: string) => Promise<void>
  }
  workspaces: {
    get: (id: string) => Promise<Workspace | undefined>
    add: (path: string, profileId: string) => Promise<Workspace>
    remove: (id: string) => Promise<void>
  }
  /** The profile a workspace's sessions run on, its shared-item links repaired first. */
  profile: (profileId: string) => Promise<{ id: string; name: string; configDir: string; adopted: boolean }>
  features: { list: () => Promise<FeatureRecord[]>; add: (r: FeatureRecord) => Promise<void>; remove: (name: string) => Promise<void> }
  /** The install command saved for a workspace's preview config; empty when none. */
  installCommand: (workspaceId: string) => Promise<string>
  /** Runs a command in a folder; rejects with the reason when it fails. */
  runInstall: (cwd: string, command: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  now: () => number
}

export const featureBranch = (name: string): string => `feat/${name}`

/** Where a workspace's feature worktrees live: a sibling folder, so the repo itself stays clean. */
export function worktreePathFor(workspacePath: string, name: string): string {
  return join(dirname(workspacePath), `${basename(workspacePath)}-worktrees`, name)
}

const fail = (error: string): NewFeatureResult => ({ ok: false, error })
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Makes the worktree and branch, adds the worktree as a workspace on the source workspace's account and records the
 * feature. A failure at any step removes what this call made.
 */
export async function createFeature(deps: CreateDeps, request: NewFeatureRequest): Promise<NewFeatureResult> {
  const source = await deps.workspaces.get(request.workspaceId)
  if (!source) return fail('That workspace no longer exists.')
  if (request.description.trim() === '') return fail('Describe the feature first.')
  const taken = (await deps.features.list()).map((f) => f.name)
  const problem = nameProblem(request.name, taken)
  if (problem) return fail(problem)
  if (!(await deps.git.isRepo(source.path))) return fail(`${source.name} is not a git repository, so there is no worktree to make.`)
  const profile = await deps.profile(source.profileId)
  if (profile.id !== source.profileId) return fail(`The account of ${source.name} was removed, so the feature would run on the default login. Pick an account for the workspace in Settings first.`)
  const noFlow = await flowProblem(profile)
  if (noFlow) return fail(noFlow)
  const base = await deps.git.mainBranch(source.path)
  if (!base) return fail(`${source.name} has no main or master branch to start the feature from.`)
  const branch = featureBranch(request.name)
  const worktreePath = worktreePathFor(source.path, request.name)
  if (await deps.pathExists(worktreePath)) return fail(`The folder ${worktreePath} already exists.`)
  if (await deps.git.branchTaken(source.path, branch)) return fail(`The branch ${branch} already exists.`)

  let madeWorktree = false
  let workspace: Workspace | undefined
  try {
    await deps.git.addWorktree(source.path, worktreePath, branch, base)
    madeWorktree = true
    const install = await deps.installCommand(source.id)
    if (install) await deps.runInstall(worktreePath, install)
    workspace = await deps.workspaces.add(worktreePath, profile.id)
    const feature: FeatureRecord = {
      name: request.name,
      workspaceId: workspace.id,
      worktreePath,
      branch,
      sessionId: request.sessionId,
      ports: [],
      startedAt: deps.now(),
      completedAt: null
    }
    await deps.features.add(feature)
    return { ok: true, feature }
  } catch (err) {
    if (workspace) await deps.workspaces.remove(workspace.id).catch(() => undefined)
    if (madeWorktree) await deps.git.removeNewWorktree(source.path, worktreePath, branch).catch(() => undefined)
    return fail(`Could not make the feature: ${reason(err)}`)
  }
}

/** Undoes a created feature whose session could not start: record, workspace and worktree go. */
export async function discardFeature(deps: Pick<CreateDeps, 'git' | 'workspaces' | 'features'>, name: string, repoPath: string): Promise<void> {
  const feature = (await deps.features.list()).find((f) => f.name === name)
  if (!feature) return
  await deps.features.remove(name)
  await deps.workspaces.remove(feature.workspaceId).catch(() => undefined)
  await deps.git.removeNewWorktree(repoPath, feature.worktreePath, feature.branch)
}
