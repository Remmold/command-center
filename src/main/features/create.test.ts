import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { profileEnv } from '../../shared/profiles'
import type { FeatureRecord } from '../../shared/features'
import type { Workspace } from '../../shared/types'
import { addWorktree, branchTaken, isGitRepo, mainBranch, removeNewWorktree } from '../git/service'
import { createFeature, discardFeature, featureBranch, worktreePathFor, type CreateDeps } from './create'

// Each test runs real git processes; a loaded machine must not turn that into a timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// A pre-commit hook runs with GIT_DIR and GIT_INDEX_FILE set, which would point these repos at the real one.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) vi.stubEnv(key, undefined as never)

let root: string
let repo: string
let configDir: string
let records: FeatureRecord[]
let workspaces: Workspace[]
let profileAdopted: boolean
let failAddingWorkspace: boolean
let profileRemoved: boolean
let installCommand: string
let installRuns: { cwd: string; command: string }[]
let installError: string | null

const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf-8' })

function workspace(path: string, profileId: string, id: string): Workspace {
  return { id, name: path, path, createdAt: 1, profileId, repoGroupKey: 'k', repoName: 'r', worktreeTag: '' }
}

function deps(): CreateDeps {
  return {
    git: { isRepo: isGitRepo, mainBranch, branchTaken, addWorktree, removeNewWorktree },
    workspaces: {
      get: async (id) => workspaces.find((w) => w.id === id),
      add: async (path, profileId) => {
        if (failAddingWorkspace) throw new Error('disk full')
        const added = workspace(path, profileId, `w${workspaces.length + 1}`)
        workspaces.push(added)
        return added
      },
      remove: async (id) => void (workspaces = workspaces.filter((w) => w.id !== id))
    },
    profile: async (id) => ({ id: profileRemoved ? 'default' : id, name: 'Work', configDir, adopted: profileAdopted }),
    features: {
      list: async () => records,
      add: async (r) => void records.push(r),
      remove: async (name) => void (records = records.filter((r) => r.name !== name))
    },
    installCommand: async (workspaceId) => (workspaceId === 'src' ? installCommand : ''),
    runInstall: async (cwd, command) => {
      installRuns.push({ cwd, command })
      if (installError) throw new Error(installError)
    },
    pathExists: async (p) => existsSync(p),
    now: () => 42
  }
}

const request = { workspaceId: 'src', name: 'login', description: 'Add a login page', sessionId: 's1' }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-feature-'))
  repo = join(root, 'repo')
  configDir = join(root, 'claude-work')
  mkdirSync(join(configDir, 'skills', 'flow'), { recursive: true })
  writeFileSync(join(configDir, 'skills', 'flow', 'SKILL.md'), '# flow')
  mkdirSync(repo)
  git(repo, 'init', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a')
  git(repo, 'add', '.')
  git(repo, 'commit', '-m', 'first')
  records = []
  workspaces = [workspace(repo, 'work-profile', 'src')]
  profileAdopted = false
  failAddingWorkspace = false
  profileRemoved = false
  installCommand = ''
  installRuns = []
  installError = null
})

afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('createFeature', () => {
  it('makes the worktree on a new branch and records the feature on the source workspace account', async () => {
    const result = await createFeature(deps(), request)
    expect(result.ok).toBe(true)
    const path = worktreePathFor(repo, 'login')
    expect(existsSync(join(path, 'a.txt'))).toBe(true)
    expect(git(path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe(featureBranch('login'))
    expect(records).toEqual([
      { name: 'login', workspaceId: 'w2', worktreePath: path, branch: 'feat/login', sessionId: 's1', ports: [], startedAt: 42, completedAt: null }
    ])
    const added = workspaces.find((w) => w.id === 'w2')
    expect(added?.profileId).toBe('work-profile')
    expect(profileEnv({ id: added!.profileId, configDir }, null)).toEqual({ CLAUDE_CONFIG_DIR: configDir })
  })

  it('refuses a folder that is not a git repository and makes nothing', async () => {
    const plain = join(root, 'plain')
    mkdirSync(plain)
    workspaces.push(workspace(plain, 'work-profile', 'plain'))
    const result = await createFeature(deps(), { ...request, workspaceId: 'plain' })
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/not a git repository/) })
    expect(existsSync(join(root, 'plain-worktrees'))).toBe(false)
    expect(records).toEqual([])
    expect(workspaces).toHaveLength(2)
  })

  it('refuses a taken or invalid name with the reason', async () => {
    await createFeature(deps(), request)
    expect(await createFeature(deps(), { ...request, sessionId: 's2' })).toEqual({ ok: false, error: expect.stringMatching(/already called login/) })
    expect(await createFeature(deps(), { ...request, name: 'No Good' })).toEqual({ ok: false, error: expect.stringMatching(/lowercase letters/) })
    expect(records).toHaveLength(1)
  })

  it('refuses an account whose Claude folder has no /flow', async () => {
    rmSync(join(configDir, 'skills'), { recursive: true })
    profileAdopted = true
    const result = await createFeature(deps(), request)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/cannot run \/flow/) })
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login').trim()).toBe('')
  })

  it('refuses a workspace whose account was removed instead of falling back to the default login', async () => {
    profileRemoved = true
    const result = await createFeature(deps(), request)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/account of .* was removed/) })
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
  })

  it('removes the worktree and branch it just made when a later step fails', async () => {
    failAddingWorkspace = true
    const result = await createFeature(deps(), request)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/disk full/) })
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login').trim()).toBe('')
    expect(git(repo, 'worktree', 'list', '--porcelain')).not.toMatch(/login/)
    expect(records).toEqual([])
    expect(workspaces).toHaveLength(1)
  })
})

describe('createFeature install step', () => {
  it('runs the source workspace install command in the new worktree before recording the feature', async () => {
    installCommand = 'pnpm install'
    const result = await createFeature(deps(), request)
    expect(result.ok).toBe(true)
    expect(installRuns).toEqual([{ cwd: worktreePathFor(repo, 'login'), command: 'pnpm install' }])
  })

  it('runs nothing for a workspace without an install command, exactly as before', async () => {
    const result = await createFeature(deps(), request)
    expect(result.ok).toBe(true)
    expect(installRuns).toEqual([])
    expect(records).toHaveLength(1)
  })

  it('cleans up and shows the reason when the install fails', async () => {
    installCommand = 'pnpm install'
    installError = 'The install command failed: network down'
    const result = await createFeature(deps(), request)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/network down/) })
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login').trim()).toBe('')
    expect(records).toEqual([])
    expect(workspaces).toHaveLength(1)
  })
})

describe('discardFeature', () => {
  it('leaves no record, workspace or worktree behind', async () => {
    await createFeature(deps(), request)
    await discardFeature(deps(), 'login', repo)
    expect(records).toEqual([])
    expect(workspaces).toHaveLength(1)
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login').trim()).toBe('')
  })
})
