import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import type { OpenWorkItem } from '../../shared/openWork'
import { scanOpenWork, type OpenWorkDeps, type OpenWorkWorkspace } from './openWork'

const DAY = 86_400

interface FakeRepo {
  main: string | null
  /** Porcelain worktree list; the first entry is the main checkout. */
  worktrees: { path: string; branch: string | null; prunable?: boolean }[]
  /** Branches not in local main; `inRemote` ones are merged into origin's main. */
  unmerged: { branch: string; at: number; inRemote?: boolean }[]
  /** Whether origin's main exists. */
  remote?: boolean
  ahead: Record<string, number>
  dirty: string[]
  lastCommit: Record<string, number>
}

function porcelain(repo: FakeRepo): string {
  return repo.worktrees
    .map((w) => [`worktree ${resolve(w.path).replace(/\\/g, '/')}`, 'HEAD abc', w.branch ? `branch refs/heads/${w.branch}` : 'detached', ...(w.prunable ? ['prunable gitdir file points to non-existent location'] : [])].join('\n'))
    .join('\n\n')
}

function fakeDeps(repos: Record<string, FakeRepo>, opts: { failing?: string[]; missing?: string[]; sessions?: Record<string, { name: string; mtimeMs: number }[]> } = {}): OpenWorkDeps {
  const repoOf = (cwd: string): FakeRepo => {
    const found = Object.values(repos).find((r) => r.worktrees.some((w) => resolve(w.path) === resolve(cwd)))
    if (!found) throw new Error(`no repo at ${cwd}`)
    return found
  }
  return {
    git: async (cwd, args) => {
      if (opts.failing?.some((p) => resolve(p) === resolve(cwd))) throw new Error('fatal: not a git repository')
      const repo = repoOf(cwd)
      const cmd = args.join(' ')
      if (cmd === 'worktree list --porcelain') return porcelain(repo)
      if (args[0] === 'rev-parse') {
        if (repo.remote && args.at(-1) === `refs/remotes/origin/${repo.main}`) return 'abc\n'
        throw new Error('')
      }
      if (args[0] === 'for-each-ref') {
        const remoteToo = args.includes(`--no-merged=refs/remotes/origin/${repo.main}`)
        return repo.unmerged
          .filter((b) => !(remoteToo && b.inRemote))
          .map((b) => `refs/heads/${b.branch}\t${b.at}`)
          .join('\n')
      }
      if (args[0] === 'log') return `${repo.lastCommit[resolve(cwd)] ?? 1000}\n`
      if (args[0] === 'status') return repo.dirty.includes(resolve(cwd)) ? ' M a.txt\n' : ''
      if (args[0] === 'rev-list') {
        const ref = args[2]
        const key = ref === 'HEAD' ? resolve(cwd) : ref.slice('refs/heads/'.length)
        return `${repo.ahead[key] ?? 0}\n`
      }
      throw new Error(`unexpected git ${cmd}`)
    },
    mainBranch: async (path) => repoOf(path).main,
    pathExists: async (path) => !(opts.missing ?? []).some((m) => resolve(m) === resolve(path)),
    transcriptsDir: async (profileId, cwd) => `${profileId}|${resolve(cwd)}`,
    listFiles: async (dir) => opts.sessions?.[dir] ?? [],
    mainChatDir: resolve('/data/main-chat'),
    now: () => 100 * DAY * 1000
  }
}

const ws = (id: string, path: string, repo: string, label = id): OpenWorkWorkspace => ({ id, label, path: resolve(path), profileId: 'default', repoGroupKey: `git:${repo}` })

const feature = (worktreePath: string, branch: string, workspaceId = 'other'): FeatureRecord => ({
  name: branch,
  workspaceId,
  worktreePath: resolve(worktreePath),
  branch,
  sessionId: 's',
  ports: [],
  startedAt: 0,
  completedAt: null
})

const repoA = (over: Partial<FakeRepo> = {}): FakeRepo => ({
  main: 'main',
  worktrees: [{ path: '/r/a', branch: 'main' }],
  unmerged: [],
  ahead: {},
  dirty: [],
  lastCommit: {},
  ...over
})

const kinds = (items: OpenWorkItem[]): string[] => items.map((i) => `${i.kind}:${i.branch}`)

describe('scanOpenWork', () => {
  it('lists an untracked worktree with its state and leaves out a tracked one', async () => {
    const repo = repoA({
      worktrees: [
        { path: '/r/a', branch: 'main' },
        { path: '/r/a-wt/old', branch: 'old-work' },
        { path: '/r/a-wt/feat', branch: 'feat/x' }
      ],
      ahead: { [resolve('/r/a-wt/old')]: 3 },
      dirty: [resolve('/r/a-wt/old')],
      lastCommit: { [resolve('/r/a-wt/old')]: 90 * DAY }
    })
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [feature('/r/a-wt/feat', 'feat/x')], fakeDeps({ a: repo }))
    expect(report.workspaces[0].items).toEqual([
      { kind: 'worktree', path: resolve('/r/a-wt/old'), branch: 'old-work', lastCommitAt: 90 * DAY * 1000, ahead: 3, dirty: true, session: null }
    ])
  })

  it('lists prunable and vanished worktrees as missing, not as items', async () => {
    const repo = repoA({
      worktrees: [
        { path: '/r/a', branch: 'main' },
        { path: '/r/a-wt/gone', branch: 'gone', prunable: true },
        { path: '/r/a-wt/deleted', branch: null }
      ]
    })
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [], fakeDeps({ a: repo }, { missing: ['/r/a-wt/deleted'] }))
    expect(report.workspaces[0].items).toEqual([])
    expect(report.workspaces[0].missing).toEqual([
      { path: resolve('/r/a-wt/gone'), branch: 'gone' },
      { path: resolve('/r/a-wt/deleted'), branch: null }
    ])
  })

  it('lists an unmerged branch only when no worktree has it checked out, and skips one with nothing ahead', async () => {
    const repo = repoA({
      worktrees: [
        { path: '/r/a', branch: 'main' },
        { path: '/r/a-wt/busy', branch: 'busy' }
      ],
      unmerged: [
        { branch: 'loose', at: 50 * DAY },
        { branch: 'busy', at: 60 * DAY },
        { branch: 'squashed', at: 40 * DAY }
      ],
      ahead: { loose: 2, squashed: 0 }
    })
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [], fakeDeps({ a: repo }))
    const items = report.workspaces[0].items
    expect(kinds(items)).toEqual(['worktree:busy', 'branch:loose'])
    expect(items[1]).toEqual({ kind: 'branch', branch: 'loose', lastCommitAt: 50 * DAY * 1000, ahead: 2 })
  })

  it('leaves out merged branches (git lists only unmerged ones) and a feature branch whose worktree is gone', async () => {
    const repo = repoA({ unmerged: [{ branch: 'feat/done', at: 10 }], ahead: { 'feat/done': 4 } })
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [feature('/elsewhere/done', 'feat/done', 'a')], fakeDeps({ a: repo }))
    expect(report.workspaces[0].items).toEqual([])
  })

  it('counts a branch merged into origin main as merged, even when local main is behind', async () => {
    const repo = repoA({ remote: true, unmerged: [{ branch: 'shipped', at: 10, inRemote: true }, { branch: 'open', at: 20 }], ahead: { shipped: 5, open: 1 } })
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [], fakeDeps({ a: repo }))
    expect(kinds(report.workspaces[0].items)).toEqual(['branch:open'])
  })

  it('leaves out Claude Code agent worktrees inside the repo', async () => {
    const repo = repoA({ worktrees: [{ path: '/r/a', branch: 'main' }, { path: '/r/a/.claude/worktrees/agent-1', branch: 'tmp' }] })
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [], fakeDeps({ a: repo }))
    expect(report.workspaces[0].items).toEqual([])
  })

  it('reports a main checkout on another branch, clean or dirty', async () => {
    const clean = repoA({ worktrees: [{ path: '/r/a', branch: 'rewrite' }], ahead: { [resolve('/r/a')]: 7 } })
    const dirty = { ...repoA({ worktrees: [{ path: '/r/b', branch: 'spike' }] }), dirty: [resolve('/r/b')] }
    const report = await scanOpenWork([ws('a', '/r/a', 'a'), ws('b', '/r/b', 'b')], [], fakeDeps({ a: clean, b: dirty }))
    expect(report.workspaces.map((w) => w.items[0])).toEqual([
      { kind: 'main-checkout', path: resolve('/r/a'), branch: 'rewrite', lastCommitAt: 1000 * 1000, ahead: 7, dirty: false, session: null },
      { kind: 'main-checkout', path: resolve('/r/b'), branch: 'spike', lastCommitAt: 1000 * 1000, ahead: 0, dirty: true, session: null }
    ])
  })

  it('marks only the workspace whose git fails, and skips non-repos and the main chat', async () => {
    const report = await scanOpenWork(
      [ws('a', '/r/a', 'a'), ws('b', '/r/b', 'b'), { ...ws('plain', '/r/plain', 'x'), repoGroupKey: 'path:/r/plain' }, ws('chat', '/data/main-chat', 'chat')],
      [],
      fakeDeps({ a: repoA({ worktrees: [{ path: '/r/a', branch: 'other' }] }), b: repoA({ worktrees: [{ path: '/r/b', branch: 'main' }] }) }, { failing: ['/r/b'] })
    )
    expect(report.workspaces.map((w) => [w.workspaceId, w.error ?? null, w.items.length])).toEqual([
      ['a', null, 1],
      ['b', 'fatal: not a git repository', 0]
    ])
  })

  it('scans a repo once, named after its main checkout, when its worktrees are workspaces too', async () => {
    const repo = repoA({ worktrees: [{ path: '/r/a', branch: 'main' }, { path: '/r/a-wt/w', branch: 'w' }] })
    const report = await scanOpenWork([ws('w', '/r/a-wt/w', 'a', 'A · w'), ws('a', '/r/a', 'a', 'A')], [], fakeDeps({ a: repo }))
    expect(report.workspaces.map((w) => [w.workspaceId, w.label, kinds(w.items)])).toEqual([['a', 'A', ['worktree:w']]])
  })

  it('finds the newest transcript for a worktree, or none', async () => {
    const repo = repoA({ worktrees: [{ path: '/r/a', branch: 'main' }, { path: '/r/a-wt/s', branch: 's' }, { path: '/r/a-wt/n', branch: 'n' }] })
    const sessions = {
      [`default|${resolve('/r/a-wt/s')}`]: [
        { name: 'old.jsonl', mtimeMs: 5 },
        { name: 'new.jsonl', mtimeMs: 9 },
        { name: 'notes.txt', mtimeMs: 99 }
      ]
    }
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [], fakeDeps({ a: repo }, { sessions }))
    expect(report.workspaces[0].items.map((i) => (i.kind === 'branch' ? null : i.session))).toEqual([{ id: 'new', mtime: 9 }, null])
  })

  it('reports a repo without a main branch as an error', async () => {
    const report = await scanOpenWork([ws('a', '/r/a', 'a')], [], fakeDeps({ a: repoA({ main: null }) }))
    expect(report.workspaces[0].error).toBe('no main or master branch')
  })
})
