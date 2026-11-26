import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import { commitsBeyond, completeFeature, removeFeatureWorktree, removeWorktreeOnly, reopenFeature } from './complete'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
// A pre-commit hook runs with GIT_DIR set, which would point the temp repos at the real one.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) vi.stubEnv(key, undefined as never)

const record = (patch: Partial<FeatureRecord> = {}): FeatureRecord => ({
  name: 'login', workspaceId: 'w', worktreePath: 'C:/wt/login', branch: 'feat/login', sessionId: 's', ports: [4100, 4101], portNames: ['web', 'api'], startedAt: 1, completedAt: null, ...patch
})

describe('Complete', () => {
  let current: FeatureRecord
  let calls: string[]
  const deps = () => ({
    feature: async () => current,
    runner: { stop: async () => void calls.push('stop servers'), remove: async () => void calls.push('forget servers') },
    closePair: async () => void calls.push('close pair'),
    setPorts: async (_n: string, ports: number[]) => void calls.push(`ports ${JSON.stringify(ports)}`),
    setCompleted: async (_n: string, at: number | null) => void calls.push(`completed ${at}`),
    now: () => 99
  })
  beforeEach(() => {
    current = record()
    calls = []
  })

  it('stops the servers, forgets them, closes the pair and its store, frees the ports, then marks it completed, in that order', async () => {
    expect(await completeFeature(deps(), 'login')).toEqual({ ok: true })
    expect(calls).toEqual(['stop servers', 'forget servers', 'close pair', 'ports []', 'completed 99'])
  })

  it('refuses an unknown or an already completed feature and changes nothing', async () => {
    current = record({ completedAt: 5 })
    expect(await completeFeature(deps(), 'login')).toEqual({ ok: false, error: 'login is already completed.' })
    expect(await completeFeature({ ...deps(), feature: async () => undefined }, 'x')).toEqual({ ok: false, error: 'The feature x is not known.' })
    expect(calls).toEqual([])
  })

  it('says why when a step fails, and does not mark it completed', async () => {
    const result = await completeFeature({ ...deps(), closePair: async () => { throw new Error('boom') } }, 'login')
    expect(result).toEqual({ ok: false, error: 'Could not complete login: boom' })
    expect(calls).not.toContain('completed 99')
  })
})

describe('Re-open', () => {
  let calls: string[]
  const config = { install: '', startPage: '/', servers: [{ name: 'web', command: 'x', cwd: '.', ready: 'port' as const }] }
  const deps = (reserve: { ok: true; ports: number[] } | { ok: false; error: string }) => ({
    feature: async () => record({ completedAt: 5, ports: [], portNames: [] }),
    config: async () => config,
    reservePorts: async (_n: string, servers: string[]) => {
      calls.push(`reserve ${servers}`)
      return reserve
    },
    setPorts: async () => void calls.push('free'),
    setCompleted: async (_n: string, at: number | null) => void calls.push(`completed ${at}`)
  })
  beforeEach(() => {
    calls = []
  })

  it('returns the feature to its stage and reserves ports for each server', async () => {
    expect(await reopenFeature(deps({ ok: true, ports: [4100] }), 'login')).toEqual({ ok: true })
    expect(calls).toEqual(['completed null', 'reserve web'])
  })

  it('stays completed when no port can be reserved', async () => {
    expect(await reopenFeature(deps({ ok: false, error: 'No free port' }), 'login')).toEqual({ ok: false, error: 'No free port' })
    expect(calls).toEqual(['completed null', 'reserve web', 'free', 'completed 5'])
  })

  it('refuses a feature that is not completed', async () => {
    const open = { ...deps({ ok: true, ports: [] }), feature: async () => record() }
    expect((await reopenFeature(open, 'login')).ok).toBe(false)
  })
})

describe('Remove worktree', () => {
  let root: string
  let repo: string
  let tree: string
  let forgotten: string[]
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf-8' })
  const deps = (completedAt: number | null = 5) => ({
    feature: async () => record({ worktreePath: tree, completedAt }),
    repo: async () => ({ path: repo, base: 'main' }),
    commitsBeyond,
    removeWorktree: removeWorktreeOnly,
    forget: async (f: FeatureRecord) => void forgotten.push(f.name)
  })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cc-complete-'))
    repo = join(root, 'repo')
    tree = join(root, 'repo-worktrees', 'login')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'first')
    git(repo, 'worktree', 'add', '-b', 'feat/login', tree, 'main')
    forgotten = []
  })
  afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))

  it('removes the worktree and keeps the branch when the branch holds nothing main lacks', async () => {
    expect(await removeFeatureWorktree(deps(), 'login')).toEqual({ ok: true })
    expect(existsSync(tree)).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login')).toContain('feat/login')
    expect(forgotten).toEqual(['login'])
  })

  it('removes it once the branch is merged into main', async () => {
    writeFileSync(join(tree, 'b.txt'), 'b')
    git(tree, 'add', '.')
    git(tree, 'commit', '-m', 'work')
    git(repo, 'merge', '--no-edit', 'feat/login')
    expect(await removeFeatureWorktree(deps(), 'login')).toEqual({ ok: true })
    expect(existsSync(tree)).toBe(false)
  })

  it('refuses while the branch has a commit main does not, and leaves everything', async () => {
    writeFileSync(join(tree, 'b.txt'), 'b')
    git(tree, 'add', '.')
    git(tree, 'commit', '-m', 'work')
    const result = await removeFeatureWorktree(deps(), 'login')
    expect(result).toEqual({ ok: false, error: 'feat/login has 1 commit that main does not; merge it first.' })
    expect(existsSync(tree)).toBe(true)
    expect(forgotten).toEqual([])
  })

  it('refuses a worktree with uncommitted changes, as git does', async () => {
    writeFileSync(join(tree, 'a.txt'), 'changed')
    expect((await removeFeatureWorktree(deps(), 'login')).ok).toBe(false)
    expect(existsSync(tree)).toBe(true)
  })

  it('refuses a feature that is not completed', async () => {
    expect(await removeFeatureWorktree(deps(null), 'login')).toEqual({ ok: false, error: 'Complete login before removing its worktree.' })
    expect(existsSync(tree)).toBe(true)
  })
})
