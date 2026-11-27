import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import { pathKey } from '../../shared/findings'
import type { Workspace } from '../../shared/types'
import { adoptWork, preflightAdopt, rollbackAdopt, type AdoptDeps } from './adopt'
import { runGit } from './complete'
import { worktreePathFor } from './create'
import { scanGit, scanOpenWork, type OpenWorkWorkspace } from './openWork'
import { git, isolateGitEnv } from '../util/testGit'

isolateGitEnv()

let root: string
let repo: string

const commit = (cwd: string, file: string): void => {
  writeFileSync(join(cwd, file), file)
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-q', '-m', file)
}
const head = (cwd: string): string => git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD').trim()

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'cc-adopt-')))
  repo = join(root, 'app')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  commit(repo, 'a.txt')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

interface World {
  deps: AdoptDeps
  /** Every git command the adopt ran, as `cwd: args`. */
  ran: string[]
  features: FeatureRecord[]
  workspaces: Workspace[]
}

const workspace = (id: string, path: string): Workspace => ({ id, name: id, path, profileId: 'default', repoGroupKey: 'git:app' }) as Workspace

function world(opts: { features?: FeatureRecord[]; sessions?: Record<string, { name: string; mtimeMs: number }[]>; running?: string[]; failOn?: string } = {}): World {
  const features = [...(opts.features ?? [])]
  const workspaces = [workspace('app', repo)]
  const ran: string[] = []
  const labelled = (): OpenWorkWorkspace[] => workspaces.map((w) => ({ ...w, label: w.name }))
  const deps: AdoptDeps = {
    workspaces: {
      get: async (id) => workspaces.find((w) => w.id === id),
      at: async (path) => workspaces.find((w) => pathKey(w.path) === pathKey(path)),
      add: async (path, profileId) => {
        const w = { ...workspace(`ws-${workspaces.length}`, path), profileId }
        workspaces.push(w)
        return w
      },
      remove: async (id) => void workspaces.splice(workspaces.findIndex((w) => w.id === id), 1)
    },
    repoOf: async () => labelled(),
    scan: (known) =>
      scanOpenWork(known, features, {
        git: scanGit(),
        mainBranch: async () => 'main',
        pathExists: async (p) => existsSync(p),
        transcriptsDir: async (_profile, cwd) => resolve(cwd),
        listFiles: async (dir) => Object.entries(opts.sessions ?? {}).find(([path]) => pathKey(path) === pathKey(dir))?.[1] ?? [],
        mainChatDir: join(root, 'main-chat'),
        now: () => Date.now()
      }),
    profile: async (id) => ({ id }),
    sessionRunning: async (_profile, id) => (opts.running ?? []).includes(id),
    features: {
      list: async () => features,
      add: async (r) => void features.push(r),
      remove: async (name) => void features.splice(features.findIndex((f) => f.name === name), 1)
    },
    git: async (cwd, args) => {
      ran.push(`${pathKey(cwd)}: ${args.join(' ')}`)
      if (opts.failOn && args.join(' ').startsWith(opts.failOn)) throw new Error(`fatal: ${opts.failOn} refused`)
      return runGit(cwd, args)
    },
    pathExists: async (p) => existsSync(p),
    now: () => 5
  }
  return { deps, ran, features, workspaces }
}

const request = (branch: string, more: { path?: string; name?: string } = {}) => ({ workspaceId: 'app', branch, ...more })

describe('adopting a worktree', () => {
  it('records a feature on the existing worktree, its workspace added, with no worktree made and no install', async () => {
    const wt = join(root, 'spike-wt')
    git(repo, 'worktree', 'add', '-q', '-b', 'spike/login-page', wt)
    commit(wt, 'b.txt')
    const w = world()
    const check = await preflightAdopt(w.deps, request('spike/login-page'))
    expect(check).toMatchObject({ ok: true, preview: { kind: 'worktree', name: 'login-page', path: wt, worktreePath: wt, ahead: 1, dirty: false, session: null } })

    const done = await adoptWork(w.deps, { ...request('spike/login-page', { path: wt }), sessionId: 'pane-1' })
    expect(done.ok).toBe(true)
    expect(w.features).toEqual([
      { name: 'login-page', workspaceId: 'ws-1', sourceWorkspaceId: 'app', worktreePath: wt, branch: 'spike/login-page', sessionId: 'pane-1', ports: [], startedAt: 5, completedAt: null }
    ])
    expect(w.workspaces.map((x) => pathKey(x.path))).toEqual([pathKey(repo), pathKey(wt)])
    expect(w.ran).toEqual([])
    expect(await preflightAdopt(w.deps, request('spike/login-page'))).toEqual({ ok: false, error: 'spike/login-page is already the feature login-page.' })
  })

  it('resumes the session found for its folder, and refuses while that session runs elsewhere', async () => {
    const wt = join(root, 'wt')
    git(repo, 'worktree', 'add', '-q', '-b', 'resume-me', wt)
    commit(wt, 'b.txt')
    const sessions = { [wt]: [{ name: 'old.jsonl', mtimeMs: 1 }, { name: 'abc-123.jsonl', mtimeMs: 9 }] }
    expect(await preflightAdopt(world({ sessions, running: ['abc-123'] }).deps, request('resume-me'))).toEqual({
      ok: false,
      error: 'Its Claude session abc-123 is still running elsewhere; close it there first, then adopt.'
    })
    const w = world({ sessions })
    const done = await adoptWork(w.deps, { ...request('resume-me'), sessionId: 'pane' })
    expect(done).toMatchObject({ ok: true, preview: { session: { id: 'abc-123', mtime: 9 } } })
    expect(w.features[0].claudeSessionId).toBe('abc-123')
  })

  it('refuses a name a feature has and asks the chat for a name part; a name part then adopts', async () => {
    git(repo, 'worktree', 'add', '-q', '-b', 'feat/export', join(root, 'wt'))
    commit(join(root, 'wt'), 'b.txt')
    const taken: FeatureRecord = { name: 'export', workspaceId: 'x', worktreePath: join(root, 'elsewhere'), branch: 'feat/other', sessionId: 's', ports: [], startedAt: 0, completedAt: null }
    const w = world({ features: [taken] })
    expect(await preflightAdopt(w.deps, request('feat/export'))).toEqual({ ok: false, error: 'Another feature is already called export. Ask the chat for a name: part.' })
    expect(await preflightAdopt(w.deps, request('feat/export', { name: 'export-2' }))).toMatchObject({ ok: true, preview: { name: 'export-2' } })
  })

  it('names what is missing: a branch with no open work, or a path that does not match', async () => {
    const w = world()
    expect(await preflightAdopt(w.deps, request('nope'))).toEqual({
      ok: false,
      error: 'No open work on nope in app: it may be merged, gone or a feature already. The Open work section lists what can be adopted.'
    })
    git(repo, 'worktree', 'add', '-q', '-b', 'here', join(root, 'wt'))
    commit(join(root, 'wt'), 'b.txt')
    expect((await preflightAdopt(w.deps, request('here', { path: join(root, 'other') }))).ok).toBe(false)
  })
})

describe('adopting a branch without a worktree', () => {
  it('makes the worktree where a new feature would go, on the existing branch, never a new one', async () => {
    git(repo, 'switch', '-q', '-c', 'old-idea')
    commit(repo, 'b.txt')
    git(repo, 'switch', '-q', 'main')
    const w = world()
    const target = worktreePathFor(repo, 'old-idea')
    expect(await preflightAdopt(w.deps, request('old-idea'))).toMatchObject({ ok: true, preview: { kind: 'branch', path: null, worktreePath: target, dirty: null, session: null } })
    const done = await adoptWork(w.deps, { ...request('old-idea'), sessionId: 'p' })
    expect(done.ok).toBe(true)
    expect(w.ran).toEqual([`${pathKey(repo)}: worktree add ${target} old-idea`])
    expect(head(target)).toBe('old-idea')
    expect(w.features[0]).toMatchObject({ name: 'old-idea', worktreePath: target, branch: 'old-idea' })
  })
})

describe('adopting a main checkout on a branch', () => {
  beforeEach(() => {
    git(repo, 'switch', '-q', '-c', 'wip/checkout')
    commit(repo, 'b.txt')
  })

  it('is refused while the main checkout has uncommitted changes', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed')
    const w = world()
    expect(await preflightAdopt(w.deps, request('wip/checkout'))).toEqual({ ok: false, error: `Uncommitted changes in ${repo}; commit or stash them first.` })
    expect(await adoptWork(w.deps, { ...request('wip/checkout'), sessionId: 'p' })).toMatchObject({ ok: false })
    expect(w.ran).toEqual([])
    expect(head(repo)).toBe('wip/checkout')
  })

  it('switches the main checkout back to main, then makes the worktree for the branch', async () => {
    const w = world()
    const target = worktreePathFor(repo, 'checkout')
    const done = await adoptWork(w.deps, { ...request('wip/checkout'), sessionId: 'p' })
    expect(done).toMatchObject({ ok: true, preview: { kind: 'main-checkout', path: repo, worktreePath: target, mainPath: repo, mainBranch: 'main' } })
    expect(w.ran).toEqual([`${pathKey(repo)}: switch main`, `${pathKey(repo)}: worktree add ${target} wip/checkout`])
    expect(head(repo)).toBe('main')
    expect(head(target)).toBe('wip/checkout')
  })

  it('rolls back when the worktree cannot be made: the main checkout goes back on the branch, and the report names the step', async () => {
    const w = world({ failOn: 'worktree add' })
    const done = await adoptWork(w.deps, { ...request('wip/checkout'), sessionId: 'p' })
    expect(done).toEqual({ ok: false, error: 'Could not adopt wip/checkout while making the worktree for the branch: fatal: worktree add refused. Everything was put back as it was.' })
    expect(head(repo)).toBe('wip/checkout')
    expect(w.features).toEqual([])
    expect(w.workspaces).toHaveLength(1)
    expect(w.ran.every((c) => !c.includes('--force') && !/ -D\b/.test(c))).toBe(true)
  })

  it('says what remains when the rollback cannot switch back', async () => {
    const w = world({ failOn: 'switch wip' })
    const done = await adoptWork(w.deps, { ...request('wip/checkout'), sessionId: 'p' })
    expect(done.ok).toBe(true)
    if (!done.ok || !('undo' in done) || !done.undo) throw new Error('no undo')
    const left = await rollbackAdopt(w.deps, done.undo)
    expect(left).toEqual([
      `the main checkout ${repo} is on main, not wip/checkout (git switch wip/checkout there)`
    ])
    expect(existsSync(worktreePathFor(repo, 'checkout'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'wip/checkout').trim()).not.toBe('')
    expect(w.features).toEqual([])
  })
})
