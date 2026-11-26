import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { profileEnv } from '../../shared/profiles'
import { BRIEF_LIMIT, type FeatureRecord } from '../../shared/features'
import type { Workspace } from '../../shared/types'
import { addWorktree, branchTaken, isGitRepo, mainBranch, removeNewWorktree } from '../git/service'
import { git, isolateGitEnv, makeTempRepo } from '../util/testGit'
import { createFeature, discardFeature, featureBranch, preflightFeature, worktreePathFor, writeNewFile, type CreateDeps } from './create'

// Each test runs real git processes; a loaded machine must not turn that into a timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

isolateGitEnv()

let root: string
let repo: string
let configDir: string
let records: FeatureRecord[]
let workspaces: Workspace[]
let profileAdopted: boolean
let failAddingWorkspace: boolean
let profileRemoved: boolean
let installCommand: string
let previewServers: number
let installRuns: { cwd: string; command: string; env: Record<string, string> }[]
let installingCalls: string[]
let installError: string | null
let briefWriteError: string | null

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
    profile: async (id) => ({ id: profileRemoved ? 'default' : id, name: 'Work', configDir, adopted: profileAdopted, env: profileEnv({ id, configDir }, null) }),
    features: {
      list: async () => records,
      add: async (r) => void records.push(r),
      remove: async (name) => void (records = records.filter((r) => r.name !== name))
    },
    installCommand: async (workspaceId) => (workspaceId === 'src' ? installCommand : ''),
    hasPreviewBrowser: async (workspaceId) => workspaceId === 'src' && previewServers > 0,
    runInstall: async (cwd, command, env) => {
      installRuns.push({ cwd, command, env })
      if (installError) throw new Error(installError)
    },
    installing: (name, running) => void installingCalls.push(`${name}:${running}`),
    pathExists: async (p) => existsSync(p),
    writeNewFile: async (path, text) => {
      if (briefWriteError) throw new Error(briefWriteError)
      await writeNewFile(path, text)
    },
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
  makeTempRepo(root)
  records = []
  workspaces = [workspace(repo, 'work-profile', 'src')]
  profileAdopted = false
  failAddingWorkspace = false
  profileRemoved = false
  installCommand = ''
  previewServers = 0
  installRuns = []
  installingCalls = []
  installError = null
  briefWriteError = null
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
      { name: 'login', workspaceId: 'w2', sourceWorkspaceId: 'src', worktreePath: path, branch: 'feat/login', sessionId: 's1', ports: [], startedAt: 42, completedAt: null }
    ])
    const added = workspaces.find((w) => w.id === 'w2')
    expect(added?.profileId).toBe('work-profile')
    expect(profileEnv({ id: added!.profileId, configDir }, null)).toEqual({ CLAUDE_CONFIG_DIR: configDir })
  })

  it('says the feature has a preview browser exactly when the source workspace preview config has a server', async () => {
    const without = await createFeature(deps(), request)
    expect(without).toMatchObject({ ok: true, previewBrowser: false })
    previewServers = 1
    const withServer = await createFeature(deps(), { ...request, name: 'other', sessionId: 's2' })
    expect(withServer).toMatchObject({ ok: true, previewBrowser: true })
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

describe('createFeature starting brief', () => {
  const brief = 'Plan.\n\n```ts\nconst a = 1\n```'
  const briefFile = () => join(worktreePathFor(repo, 'login'), '.scratch', 'login', 'brief.md')
  const nothingLeft = () => {
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login').trim()).toBe('')
    expect(records).toEqual([])
    expect(workspaces).toHaveLength(1)
  }

  it('saves the brief in the new worktree and says where', async () => {
    const result = await createFeature(deps(), { ...request, brief })
    expect(result).toMatchObject({ ok: true, briefPath: briefFile() })
    expect(readFileSync(briefFile(), 'utf8')).toBe(brief)
  })

  it('writes nothing and names no path without a brief', async () => {
    const result = await createFeature(deps(), request)
    expect(result.ok && result.briefPath).toBeUndefined()
    expect(existsSync(join(worktreePathFor(repo, 'login'), '.scratch'))).toBe(false)
  })

  it('writes the brief before the install runs', async () => {
    installCommand = 'pnpm install'
    let briefAtInstall: boolean | null = null
    const d = deps()
    d.runInstall = async () => void (briefAtInstall = existsSync(briefFile()))
    await createFeature(d, { ...request, brief })
    expect(briefAtInstall).toBe(true)
  })

  it('fails and undoes everything when the brief cannot be saved', async () => {
    briefWriteError = 'read-only folder'
    const result = await createFeature(deps(), { ...request, brief })
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/starting brief could not be saved \(read-only folder\)/) })
    nothingLeft()
  })

  it('fails and undoes everything when brief.md already exists, leaving the existing text alone', async () => {
    const d = deps()
    const add = d.git.addWorktree
    d.git.addWorktree = async (...args) => {
      await add(...args)
      mkdirSync(join(args[1], '.scratch', 'login'), { recursive: true })
      writeFileSync(briefFile(), 'old')
    }
    const result = await createFeature(d, { ...request, brief })
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/brief.md already exists/) })
    nothingLeft()
  })

  it('refuses a brief over the limit before making anything, and accepts one at the limit', async () => {
    const over = await createFeature(deps(), { ...request, brief: 'x'.repeat(BRIEF_LIMIT + 1) })
    expect(over).toEqual({ ok: false, error: expect.stringMatching(/limit is 20000/) })
    nothingLeft()
    expect((await createFeature(deps(), { ...request, brief: 'x'.repeat(BRIEF_LIMIT) })).ok).toBe(true)
  })
})

describe('preflightFeature', () => {
  const problems: [string, () => Promise<void> | void, Partial<typeof request> & { brief?: string }, RegExp][] = [
    ['a taken name', async () => void (await createFeature(deps(), request)), { name: 'login' }, /already called login/],
    ['an invalid name', () => undefined, { name: 'No Good' }, /lowercase letters/],
    ['an existing branch', () => void git(repo, 'branch', 'feat/login'), {}, /branch feat\/login already exists/],
    ['an existing folder', () => mkdirSync(worktreePathFor(repo, 'login'), { recursive: true }), {}, /already exists/],
    ['a workspace that is not a repository', () => void workspaces.push(workspace(join(root, 'plain'), 'work-profile', 'plain')), { workspaceId: 'plain' }, /not a git repository/],
    ['a removed account', () => void (profileRemoved = true), {}, /account of .* was removed/],
    ['no flow skill', () => { rmSync(join(configDir, 'skills'), { recursive: true }); profileAdopted = true }, {}, /cannot run \/flow/],
    ['an unknown workspace', () => undefined, { workspaceId: 'nope' }, /no longer exists/],
    ['an empty description', () => undefined, { description: ' ' }, /Describe the feature/],
    ['a brief over the limit', () => undefined, { brief: 'x'.repeat(BRIEF_LIMIT + 1) }, /limit is 20000/]
  ]

  it.each(problems)('gives createFeature the same message for %s', async (_label, arrange, change, message) => {
    mkdirSync(join(root, 'plain'), { recursive: true })
    await arrange()
    const asked = { ...request, ...change }
    const before = records.length
    const preflight = await preflightFeature(deps(), asked)
    expect(preflight).toEqual({ ok: false, error: expect.stringMatching(message) })
    const created = await createFeature(deps(), asked)
    expect(created).toEqual(preflight)
    expect(records).toHaveLength(before)
  })

  it('says a clean request is fine and makes nothing', async () => {
    expect(await preflightFeature(deps(), { ...request, brief: 'Plan' })).toEqual({ ok: true })
    expect(existsSync(worktreePathFor(repo, 'login'))).toBe(false)
    expect(git(repo, 'branch', '--list', 'feat/login').trim()).toBe('')
    expect(records).toEqual([])
  })

  it('reports a repository without a main branch the way createFeature does', async () => {
    const d = deps()
    d.git.mainBranch = async () => null
    const preflight = await preflightFeature(d, request)
    expect(preflight).toEqual({ ok: false, error: expect.stringMatching(/no main or master branch/) })
    expect(await createFeature(d, request)).toEqual(preflight)
  })
})

describe('createFeature install step', () => {
  it('runs the source workspace install command in the new worktree before recording the feature', async () => {
    installCommand = 'pnpm install'
    const result = await createFeature(deps(), request)
    expect(result.ok).toBe(true)
    expect(installRuns).toEqual([{ cwd: worktreePathFor(repo, 'login'), command: 'pnpm install', env: expect.anything() }])
  })

  it('runs the install on the feature account environment and says while it runs', async () => {
    installCommand = 'pnpm install'
    await createFeature(deps(), request)
    expect(installRuns[0].env).toEqual({ CLAUDE_CONFIG_DIR: configDir })
    expect(installingCalls).toEqual(['login:true', 'login:false'])
  })

  it('says the install ended even when it failed', async () => {
    installCommand = 'pnpm install'
    installError = 'boom'
    await createFeature(deps(), request)
    expect(installingCalls).toEqual(['login:true', 'login:false'])
  })

  it('runs nothing for a workspace without an install command, exactly as before', async () => {
    const result = await createFeature(deps(), request)
    expect(result.ok).toBe(true)
    expect(installRuns).toEqual([])
    expect(installingCalls).toEqual([])
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
