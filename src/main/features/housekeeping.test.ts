import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import { pathKey } from '../../shared/findings'
import { housekeepingOutcomeMessage, type HousekeepingAction } from '../../shared/housekeeping'
import type { Workspace } from '../../shared/types'
import { runGit } from './complete'
import { checkHousekeeping, runHousekeeping, type HousekeepingDeps } from './housekeeping'
import { scanGit, scanOpenWork } from './openWork'
import { git, isolateGitEnv } from '../util/testGit'

isolateGitEnv()

let root: string
let repo: string

const commit = (cwd: string, file: string): void => {
  writeFileSync(join(cwd, file), file)
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-q', '-m', file)
}
const worktree = (name: string, branch: string): string => {
  const path = join(root, name)
  git(repo, 'worktree', 'add', '-q', '-b', branch, path)
  return path
}
const branches = (): string[] => git(repo, 'branch', '--format=%(refname:short)').trim().split('\n')
const listed = (): string[] => git(repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => pathKey(l.slice(9)))

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'cc-housekeeping-')))
  repo = join(root, 'app')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  commit(repo, 'a.txt')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const feature = (name: string, worktreePath: string, branch: string, completedAt: number | null = null): FeatureRecord => ({
  name,
  workspaceId: 'x',
  worktreePath,
  branch,
  sessionId: 's',
  ports: [],
  startedAt: 0,
  completedAt
})

function world(features: FeatureRecord[] = [], extraWorkspaces: string[] = []) {
  const written: string[] = []
  const completed: string[] = []
  const deps: HousekeepingDeps = {
    workspaces: async () => [{ id: 'app', name: 'app', path: repo } as Workspace, ...extraWorkspaces.map((p, i) => ({ id: `w${i}`, name: `w${i}`, path: p }) as Workspace)],
    features: async () => features,
    read: scanGit(),
    write: async (cwd, args) => {
      written.push(args.join(' '))
      return runGit(cwd, args)
    },
    mainBranch: async () => 'main',
    pathExists: async (p) => existsSync(p),
    complete: async (name) => {
      completed.push(name)
      return name === 'broken' ? { ok: false, error: 'the servers did not stop' } : { ok: true }
    }
  }
  return { deps, written, completed }
}

const request = (action: HousekeepingAction, items: string[]) => ({ workspaceId: 'app', action, items })

describe('removing merged worktrees', () => {
  it('removes only clean, merged worktrees no feature owns, skips the rest with reasons, and never forces', async () => {
    const merged = worktree('merged', 'done-a')
    const dirty = worktree('dirty', 'done-b')
    writeFileSync(join(dirty, 'a.txt'), 'changed')
    const ahead = worktree('ahead', 'wip')
    commit(ahead, 'b.txt')
    const owned = worktree('owned', 'feat/owned')
    const added = worktree('added', 'done-c')
    const agent = join(repo, '.claude', 'worktrees', 'agent-1')
    git(repo, 'worktree', 'add', '-q', '-b', 'agent-1', agent)
    const w = world([feature('owned', owned, 'feat/owned')], [added])
    const items = [merged, dirty, ahead, owned, added, agent, repo, join(root, 'nowhere')]

    const check = await checkHousekeeping(w.deps, request('remove-merged-worktrees', items))
    expect(check).toEqual({
      ok: true,
      plan: {
        will: [merged],
        skip: [
          { item: dirty, reason: 'uncommitted changes' },
          { item: ahead, reason: '1 commit not merged into main' },
          { item: owned, reason: 'the worktree of the feature owned' },
          { item: added, reason: 'a workspace in Command Center; remove the workspace in Settings first' },
          { item: agent, reason: 'a Claude Code agent worktree, in use by its session' },
          { item: repo, reason: 'the main checkout' },
          { item: join(root, 'nowhere'), reason: 'not a worktree of this repo' }
        ]
      }
    })

    const run = await runHousekeeping(w.deps, request('remove-merged-worktrees', items))
    expect(run).toMatchObject({ ok: true, results: [{ item: merged, ok: true }] })
    expect(w.written).toEqual([`worktree remove ${merged}`])
    expect(existsSync(merged)).toBe(false)
    expect(existsSync(dirty) && existsSync(ahead) && existsSync(owned)).toBe(true)
    expect(branches()).toContain('done-a')
    expect(housekeepingOutcomeMessage('app', 'remove-merged-worktrees', run)).toMatch(/^\[Command Center\] Housekeeping in app: removed 1, skipped 7, failed 0\. skipped .*dirty: uncommitted changes/)
  })

  it('re-checks at the click: a worktree that got changes since the card showed is skipped, not removed', async () => {
    const merged = worktree('merged', 'done-a')
    const w = world()
    expect(await checkHousekeeping(w.deps, request('remove-merged-worktrees', [merged]))).toMatchObject({ ok: true, plan: { will: [merged] } })
    writeFileSync(join(merged, 'new.txt'), 'x')
    expect(await runHousekeeping(w.deps, request('remove-merged-worktrees', [merged]))).toEqual({ ok: true, results: [], skipped: [{ item: merged, reason: 'uncommitted changes' }] })
    expect(w.written).toEqual([])
  })
})

describe('deleting merged branches', () => {
  it('deletes only merged local branches checked out nowhere and owned by no feature, with -d, never -D', async () => {
    git(repo, 'branch', 'merged-1')
    git(repo, 'switch', '-q', '-c', 'unmerged')
    commit(repo, 'b.txt')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'branch', 'feat/mine')
    worktree('out', 'checked-out')
    const w = world([feature('mine', join(root, 'gone'), 'feat/mine')])
    const items = ['merged-1', 'unmerged', 'feat/mine', 'checked-out', 'main', 'origin/merged-1', 'missing']
    const run = await runHousekeeping(w.deps, request('delete-merged-branches', items))
    expect(run).toEqual({
      ok: true,
      results: [{ item: 'merged-1', ok: true }],
      skipped: [
        { item: 'unmerged', reason: '1 commit not merged into main' },
        { item: 'feat/mine', reason: 'the branch of the feature mine' },
        { item: 'checked-out', reason: `checked out in ${join(root, 'out')}` },
        { item: 'main', reason: 'the main branch' },
        { item: 'origin/merged-1', reason: 'a remote branch; remote branches are never deleted' },
        { item: 'missing', reason: 'no local branch by that name' }
      ]
    })
    expect(w.written).toEqual(['branch -d merged-1'])
    expect(branches()).not.toContain('merged-1')
    expect(branches()).toEqual(expect.arrayContaining(['unmerged', 'feat/mine', 'checked-out', 'main']))
  })

  it('keeps going after a failure and reports each item on its own', async () => {
    git(repo, 'branch', 'one')
    git(repo, 'branch', 'two')
    const w = world()
    const flaky: HousekeepingDeps = { ...w.deps, write: async (cwd, args) => (args.includes('one') ? Promise.reject(new Error('error: branch one is locked')) : w.deps.write(cwd, args)) }
    const run = await runHousekeeping(flaky, request('delete-merged-branches', ['one', 'two']))
    expect(run).toEqual({ ok: true, results: [{ item: 'one', ok: false, error: 'error: branch one is locked' }, { item: 'two', ok: true }], skipped: [] })
    expect(housekeepingOutcomeMessage('app', 'delete-merged-branches', run)).toBe(
      '[Command Center] Housekeeping in app: deleted 1, skipped 0, failed 1. failed one: error: branch one is locked. Confirm this to the user in words.'
    )
  })
})

describe('pruning missing worktrees', () => {
  it('drops exactly the listed entries whose folder is gone, leaving another missing one and every existing one', async () => {
    const gone = worktree('gone', 'g1')
    const alsoGone = worktree('also-gone', 'g2')
    const here = worktree('here', 'h1')
    rmSync(gone, { recursive: true, force: true })
    rmSync(alsoGone, { recursive: true, force: true })
    const w = world()
    const run = await runHousekeeping(w.deps, request('prune-missing-worktrees', [gone, here]))
    expect(run).toEqual({ ok: true, results: [{ item: gone, ok: true }], skipped: [{ item: here, reason: 'its folder still exists' }] })
    expect(w.written).toEqual([`worktree remove ${gone}`])
    expect(listed()).toEqual([pathKey(repo), pathKey(alsoGone), pathKey(here)])
    expect(branches()).toContain('g1')
  })
})

describe('completing a feature', () => {
  it('uses the Complete action, with its checks: an unknown or completed feature is skipped', async () => {
    const w = world([feature('ready', 'x', 'feat/ready'), feature('old', 'y', 'feat/old', 10)])
    const run = await runHousekeeping(w.deps, request('complete-feature', ['ready']))
    expect(run).toEqual({ ok: true, results: [{ item: 'ready', ok: true }], skipped: [] })
    expect(w.completed).toEqual(['ready'])
    expect(await checkHousekeeping(w.deps, request('complete-feature', ['old']))).toEqual({ ok: true, plan: { will: [], skip: [{ item: 'old', reason: 'already completed' }] } })
    expect(await checkHousekeeping(w.deps, request('complete-feature', ['nope']))).toEqual({ ok: true, plan: { will: [], skip: [{ item: 'nope', reason: 'no feature named nope' }] } })
    expect(w.written).toEqual([])
  })
})

describe('the scan of merged, deletable branches', () => {
  it('lists exactly what delete-merged-branches would delete: merged into main or origin/main, checked out nowhere, owned by no feature, not main', async () => {
    git(repo, 'branch', 'merged-old')
    git(repo, 'switch', '-q', '-c', 'in-remote')
    commit(repo, 'r.txt')
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'switch', '-q', '-c', 'unmerged')
    commit(repo, 'u.txt')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'branch', 'feat/mine')
    worktree('out', 'checked-out')
    git(repo, 'update-ref', 'refs/heads/merged-new', 'HEAD')
    const features = [feature('mine', join(root, 'gone'), 'feat/mine')]
    const report = await scanOpenWork([{ id: 'app', label: 'app', path: repo, profileId: 'default', repoGroupKey: 'git:app' }], features, {
      git: scanGit(),
      mainBranch: async () => 'main',
      pathExists: async (p) => existsSync(p),
      transcriptsDir: async () => join(root, 'none'),
      listFiles: async () => [],
      mainChatDir: join(root, 'main-chat'),
      now: () => Date.now()
    })
    const names = report.workspaces[0].merged.map((b) => b.branch)
    expect(names.sort()).toEqual(['in-remote', 'merged-new', 'merged-old'])
    expect(report.workspaces[0].items.map((i) => i.branch)).toEqual(expect.arrayContaining(['unmerged', 'checked-out']))

    const all = branches()
    const check = await checkHousekeeping(world(features).deps, request('delete-merged-branches', all))
    expect(check.ok && [...check.plan.will].sort()).toEqual(names.sort())
  })
})
