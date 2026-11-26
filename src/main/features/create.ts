import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { nameProblem } from '../../shared/featureName'
import { BRIEF_LIMIT, briefRelativePath, type FeatureRecord, type NewFeatureRequest, type NewFeatureResult, type PreflightRequest, type PreflightResult } from '../../shared/features'
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
  /** The profile a workspace's sessions run on, its shared-item links repaired first, and the variables a process needs to run as it. */
  profile: (profileId: string) => Promise<{ id: string; name: string; configDir: string; adopted: boolean; env: Record<string, string> }>
  features: { list: () => Promise<FeatureRecord[]>; add: (r: FeatureRecord) => Promise<void>; remove: (name: string) => Promise<void> }
  /** The install command saved for a workspace's preview config; empty when none. */
  installCommand: (workspaceId: string) => Promise<string>
  /** Whether a workspace's preview config has at least one server, so its features have a preview browser. */
  hasPreviewBrowser: (workspaceId: string) => Promise<boolean>
  /** Runs a command in a folder on an account's environment; rejects with the reason when it fails. */
  runInstall: (cwd: string, command: string, env: Record<string, string>) => Promise<void>
  /** Told when the install starts and when it ends, so the dialog can say one is running. */
  installing?: (name: string, running: boolean) => void
  pathExists: (path: string) => Promise<boolean>
  /** Saves a new file, making its folders; rejects when the file exists, never overwriting it. */
  writeNewFile: (path: string, text: string) => Promise<void>
  now: () => number
}

export const featureBranch = (name: string): string => `feat/${name}`

/** Where a workspace's feature worktrees live: a sibling folder, so the repo itself stays clean. */
export function worktreePathFor(workspacePath: string, name: string): string {
  return join(dirname(workspacePath), `${basename(workspacePath)}-worktrees`, name)
}

export async function writeNewFile(path: string, text: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, text, { flag: 'wx' })
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

type StartPlan = { source: Workspace; profile: { id: string; env: Record<string, string> }; base: string; branch: string; worktreePath: string; briefPath: string }

/** The checks that come before anything is made. `createFeature` and the proposal card both run them, so they cannot disagree. */
async function checkStart(deps: CreateDeps, request: PreflightRequest): Promise<{ ok: true; plan: StartPlan } | { ok: false; error: string }> {
  const source = await deps.workspaces.get(request.workspaceId)
  if (request.brief !== undefined && request.brief.length > BRIEF_LIMIT) return fail(`The starting brief is ${request.brief.length} characters; the limit is ${BRIEF_LIMIT}.`)
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
  const briefPath = join(worktreePath, ...briefRelativePath(request.name).split('/'))
  if (await deps.pathExists(worktreePath)) return fail(`The folder ${worktreePath} already exists.`)
  if (await deps.git.branchTaken(source.path, branch)) return fail(`The branch ${branch} already exists.`)
  return { ok: true, plan: { source, profile, base, branch, worktreePath, briefPath } }
}

/** Whether a start would get past its first checks; nothing is made. */
export async function preflightFeature(deps: CreateDeps, request: PreflightRequest): Promise<PreflightResult> {
  const checked = await checkStart(deps, request)
  return checked.ok ? { ok: true } : checked
}

/**
 * Makes the worktree and branch, adds the worktree as a workspace on the source workspace's account and records the
 * feature. A failure at any step removes what this call made.
 */
export async function createFeature(deps: CreateDeps, request: NewFeatureRequest): Promise<NewFeatureResult> {
  const checked = await checkStart(deps, request)
  if (!checked.ok) return checked
  const { source, profile, base, branch, worktreePath, briefPath } = checked.plan

  let madeWorktree = false
  let workspace: Workspace | undefined
  try {
    await deps.git.addWorktree(source.path, worktreePath, branch, base)
    madeWorktree = true
    if (request.brief !== undefined) {
      if (await deps.pathExists(briefPath)) throw new Error(`${briefRelativePath(request.name)} already exists in the new worktree, so the starting brief was not saved over it`)
      await deps.writeNewFile(briefPath, request.brief).catch((err) => {
        throw new Error(`the starting brief could not be saved (${reason(err)})`)
      })
    }
    const install = await deps.installCommand(source.id)
    if (install) {
      deps.installing?.(request.name, true)
      try {
        await deps.runInstall(worktreePath, install, profile.env)
      } finally {
        deps.installing?.(request.name, false)
      }
    }
    workspace = await deps.workspaces.add(worktreePath, profile.id)
    const feature: FeatureRecord = {
      name: request.name,
      workspaceId: workspace.id,
      sourceWorkspaceId: source.id,
      worktreePath,
      branch,
      sessionId: request.sessionId,
      ports: [],
      startedAt: deps.now(),
      completedAt: null
    }
    await deps.features.add(feature)
    const previewBrowser = await deps.hasPreviewBrowser(source.id)
    return request.brief === undefined ? { ok: true, feature, previewBrowser } : { ok: true, feature, previewBrowser, briefPath }
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
