import { adoptFailureReport, adoptName, type AdoptPreflight, type AdoptPreview, type AdoptRequest, type AdoptWorkResult, type AdoptStep } from '../../shared/adoptWork'
import { nameProblem } from '../../shared/featureName'
import type { FeatureRecord } from '../../shared/features'
import { pathKey } from '../../shared/findings'
import type { OpenWorkItem, OpenWorkReport } from '../../shared/openWork'
import type { Workspace } from '../../shared/types'
import { worktreePathFor } from './create'
import type { OpenWorkWorkspace } from './openWork'

export interface AdoptDeps {
  workspaces: {
    get: (id: string) => Promise<Workspace | undefined>
    /** The workspace at a folder, if one is added there. */
    at: (path: string) => Promise<Workspace | undefined>
    add: (path: string, profileId: string) => Promise<Workspace>
    remove: (id: string) => Promise<void>
  }
  /** The workspaces of the repo the workspace belongs to, labelled as the scan wants them. */
  repoOf: (workspaceId: string) => Promise<OpenWorkWorkspace[]>
  /** A fresh scan of those workspaces, never the digest's cached one. */
  scan: (workspaces: OpenWorkWorkspace[]) => Promise<OpenWorkReport>
  /** The profile the workspace's sessions run on; its id differs when the workspace's account was removed. */
  profile: (profileId: string) => Promise<{ id: string }>
  /** Whether a CLI process runs the session right now, in VS Code, a terminal or another chat. */
  sessionRunning: (profileId: string, sessionId: string) => Promise<boolean>
  features: { list: () => Promise<FeatureRecord[]>; add: (r: FeatureRecord) => Promise<void>; remove: (name: string) => Promise<void> }
  /** Runs git in `cwd`, writes included; rejects with git's message. */
  git: (cwd: string, args: string[]) => Promise<string>
  pathExists: (path: string) => Promise<boolean>
  now: () => number
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err)).trim().split(/\r?\n/)[0]

type Plan = { preview: AdoptPreview; source: Workspace; profileId: string }

/** The item a block names: exactly one open-work item on the branch, at the path when one is given. */
function pick(items: readonly OpenWorkItem[], branch: string, path: string | undefined): OpenWorkItem[] {
  return items.filter((i) => i.branch === branch && (path === undefined ? true : i.kind !== 'branch' && pathKey(i.path) === pathKey(path)))
}

async function checkAdopt(deps: AdoptDeps, request: AdoptRequest): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> {
  const source = await deps.workspaces.get(request.workspaceId)
  if (!source) return fail('That workspace no longer exists.')
  const branch = request.branch.trim()
  const path = request.path?.trim() || undefined
  const group = await deps.repoOf(source.id)
  const report = (await deps.scan(group)).workspaces[0]
  if (!report) return fail(`${source.name} is not a git repository, so it has no open work.`)
  if (report.error !== undefined) return fail(`The scan of ${report.label} failed: ${report.error}.`)
  const features = await deps.features.list()
  const tracking = features.find((f) => f.branch === branch && (path === undefined || pathKey(f.worktreePath) === pathKey(path)))
  const found = pick(report.items, branch, path)
  if (found.length === 0) {
    if (tracking) return fail(`${branch} is already the feature ${tracking.name}.`)
    return fail(`No open work on ${branch}${path ? ` at ${path}` : ''} in ${report.label}: it may be merged, gone or a feature already. The Open work section lists what can be adopted.`)
  }
  if (found.length > 1) return fail(`${found.length} open items are on ${branch}; ask the chat to add a path: part naming one.`)
  const item = found[0]
  if (tracking) return fail(`${branch} is already the feature ${tracking.name}.`)
  if (item.kind === 'main-checkout' && item.dirty) return fail(`Uncommitted changes in ${item.path}; commit or stash them first.`)

  const name = request.name?.trim() || adoptName(branch)
  const problem = nameProblem(name, features.map((f) => f.name))
  if (problem) return fail(`${problem} Ask the chat for a name: part.`)
  const worktreePath = item.kind === 'worktree' ? item.path : worktreePathFor(source.path, name)
  if (item.kind !== 'worktree' && (await deps.pathExists(worktreePath))) return fail(`The folder ${worktreePath} already exists; ask the chat for another name: part.`)

  const existing = await deps.workspaces.at(worktreePath)
  const profileId = existing?.profileId ?? source.profileId
  if ((await deps.profile(profileId)).id !== profileId) {
    return fail(`The account of ${existing?.name ?? source.name} was removed, so the feature would run on the default login. Pick an account for the workspace in Settings first.`)
  }
  // The scan looked for the transcript under the account of the folder's workspace, else the repo's; another account cannot resume it.
  const sessionProfile = item.kind === 'branch' ? null : (group.find((w) => pathKey(w.path) === pathKey(item.path)) ?? group.find((w) => w.id === report.workspaceId))?.profileId
  const session = item.kind !== 'branch' && item.session && sessionProfile === profileId ? item.session : null
  if (session && (await deps.sessionRunning(profileId, session.id))) return fail(`Its Claude session ${session.id} is still running elsewhere; close it there first, then adopt.`)

  const preview: AdoptPreview = {
    kind: item.kind,
    name,
    branch,
    path: item.kind === 'branch' ? null : item.path,
    worktreePath,
    mainPath: report.path,
    mainBranch: report.mainBranch ?? 'main',
    ahead: item.ahead,
    dirty: item.kind === 'branch' ? null : item.dirty,
    session
  }
  return { ok: true, plan: { preview, source, profileId } }
}

/** Whether adopting would get past its checks, and what it would do; nothing is changed. */
export async function preflightAdopt(deps: AdoptDeps, request: AdoptRequest): Promise<AdoptPreflight> {
  const checked = await checkAdopt(deps, request)
  return checked.ok ? { ok: true, preview: checked.plan.preview } : checked
}

/** What an adopt changed, so a rollback puts back exactly that. */
export interface AdoptUndo {
  preview: AdoptPreview
  switched: boolean
  madeWorktree: boolean
  addedWorkspaceId?: string
  recordName?: string
}

/**
 * Puts back what an adopt changed, newest first: the record, a workspace it added, a worktree it made (never forced,
 * the branch kept), then the main checkout back on the branch. Resolves with what is still not as it was, read back
 * from the disk, git and the stores.
 */
export async function rollbackAdopt(deps: Pick<AdoptDeps, 'git' | 'workspaces' | 'features' | 'pathExists'>, undo: AdoptUndo): Promise<string[]> {
  const { preview } = undo
  const attempt = async (step: () => Promise<unknown>): Promise<void> => void (await step().catch(() => undefined))
  const stillThere = (check: () => Promise<boolean>): Promise<boolean> => check().catch(() => true)
  if (undo.recordName !== undefined) await attempt(() => deps.features.remove(undo.recordName as string))
  if (undo.addedWorkspaceId !== undefined) await attempt(() => deps.workspaces.remove(undo.addedWorkspaceId as string))
  if (undo.madeWorktree) {
    await attempt(() => deps.git(preview.mainPath, ['worktree', 'remove', preview.worktreePath]))
    await attempt(() => deps.git(preview.mainPath, ['worktree', 'prune']))
  }
  if (undo.switched) await attempt(() => deps.git(preview.mainPath, ['switch', preview.branch]))
  const left: string[] = []
  if (undo.recordName !== undefined && (await stillThere(async () => (await deps.features.list()).some((f) => f.name === undo.recordName)))) left.push(`the feature record ${undo.recordName}`)
  if (undo.addedWorkspaceId !== undefined && (await stillThere(async () => (await deps.workspaces.get(undo.addedWorkspaceId as string)) !== undefined))) left.push('the workspace entry')
  if (undo.madeWorktree && (await stillThere(() => deps.pathExists(preview.worktreePath)))) left.push(`the worktree ${preview.worktreePath} (git worktree remove it; the branch stays)`)
  if (undo.switched) {
    const head = (await deps.git(preview.mainPath, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
    if (head !== preview.branch) left.push(`the main checkout ${preview.mainPath} is on ${head || 'an unknown branch'}, not ${preview.branch} (git switch ${preview.branch} there)`)
  }
  return left
}

/**
 * Makes open work a feature: checks again, then for a main checkout switches it back to main; for it or a branch makes
 * the worktree (no new branch); adds the worktree as a workspace unless it is one; records the feature, resuming the
 * session found for the folder. A failure at any step puts back what this call changed.
 */
export async function adoptWork(deps: AdoptDeps, request: AdoptRequest & { sessionId: string }): Promise<AdoptWorkResult & { undo?: AdoptUndo }> {
  const checked = await checkAdopt(deps, request)
  if (!checked.ok) return checked
  const { preview, source, profileId } = checked.plan
  const undo: AdoptUndo = { preview, switched: false, madeWorktree: false }
  let step: AdoptStep = 'switch'
  try {
    if (preview.kind === 'main-checkout') {
      await deps.git(preview.mainPath, ['switch', preview.mainBranch])
      undo.switched = true
    }
    step = 'worktree'
    if (preview.kind !== 'worktree') {
      await deps.git(preview.mainPath, ['worktree', 'add', preview.worktreePath, preview.branch])
      undo.madeWorktree = true
    }
    step = 'workspace'
    const existing = await deps.workspaces.at(preview.worktreePath)
    const workspace = existing ?? (await deps.workspaces.add(preview.worktreePath, profileId))
    if (!existing) undo.addedWorkspaceId = workspace.id
    step = 'record'
    const feature: FeatureRecord = {
      name: preview.name,
      workspaceId: workspace.id,
      sourceWorkspaceId: source.id,
      worktreePath: preview.worktreePath,
      branch: preview.branch,
      sessionId: request.sessionId,
      ...(preview.session ? { claudeSessionId: preview.session.id } : {}),
      ports: [],
      startedAt: deps.now(),
      completedAt: null
    }
    await deps.features.add(feature)
    undo.recordName = feature.name
    return { ok: true, feature, preview, undo }
  } catch (err) {
    const left = await rollbackAdopt(deps, undo)
    return fail(adoptFailureReport(preview.branch, step, reason(err), left))
  }
}
