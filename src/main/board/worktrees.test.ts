import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Workspace } from '../../shared/types'
import { getCommonDir, listWorktreesPorcelain } from '../git/service'
import { deriveRepoGroup } from '../workspaces/repoGroup'
import { nodeFileReader } from './nodeFileReader'
import { readBoard } from './reader'
import { git, isolateGitEnv } from '../util/testGit'
import { createWorktreeLister, parseWorktreeList, pickExtraWorktrees } from './worktrees'

const PORCELAIN = [
  'worktree C:/projects/fs',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree C:/Users/me/AppData/Local/Temp/cc-abc123',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feature/board-worktrees',
  'locked',
  '',
  'worktree C:/projects/fs-shard',
  'HEAD 3333333333333333333333333333333333333333',
  'detached',
  '',
  'worktree C:/gone/fs-old',
  'HEAD 4444444444444444444444444444444444444444',
  'branch refs/heads/old',
  'prunable gitdir file points to non-existent location',
  '',
  'worktree C:/repos/fs.git',
  'bare',
  ''
].join('\n')

describe('worktree list', () => {
  it('reads each entry with its branch, and the bare and prunable marks', () => {
    expect(parseWorktreeList(PORCELAIN)).toEqual([
      { path: 'C:/projects/fs', branch: 'main', bare: false, prunable: false },
      { path: 'C:/Users/me/AppData/Local/Temp/cc-abc123', branch: 'feature/board-worktrees', bare: false, prunable: false },
      { path: 'C:/projects/fs-shard', branch: null, bare: false, prunable: false },
      { path: 'C:/gone/fs-old', branch: 'old', bare: false, prunable: true },
      { path: 'C:/repos/fs.git', branch: null, bare: true, prunable: false }
    ])
  })

  it('reads CRLF output and a path with spaces', () => {
    expect(parseWorktreeList('worktree C:/my repos/fs\r\nbranch refs/heads/x\r\n\r\n')).toEqual([
      { path: 'C:/my repos/fs', branch: 'x', bare: false, prunable: false }
    ])
  })

  it('keeps worktrees that are not added, skipping prunable, bare and added ones, tagged by branch or folder', () => {
    const extras = pickExtraWorktrees(parseWorktreeList(PORCELAIN), ['c:\\projects\\FS\\'])
    expect(extras).toEqual([
      { path: 'C:\\Users\\me\\AppData\\Local\\Temp\\cc-abc123', worktreeTag: 'feature/board-worktrees' },
      { path: 'C:\\projects\\fs-shard', worktreeTag: 'fs-shard' }
    ])
  })

  it('gives the main checkout no tag when only a linked worktree is added', () => {
    expect(pickExtraWorktrees(parseWorktreeList(PORCELAIN), ['C:/projects/fs-shard'])[0]).toEqual({
      path: 'C:\\projects\\fs',
      worktreeTag: ''
    })
  })

  it('lists a worktree reached twice only once', () => {
    const twice = 'worktree C:/a/main\nbare\n\nworktree C:/a/wt\nbranch refs/heads/x\n\nworktree c:\\a\\WT\\\nbranch refs/heads/x\n'
    expect(pickExtraWorktrees(parseWorktreeList(twice), [])).toEqual([{ path: 'C:\\a\\wt', worktreeTag: 'x' }])
  })
})

isolateGitEnv()

describe('worktree lister on a real repo', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
  })

  const ticketAt = (dir: string, status: string): void => {
    const file = join(dir, '.scratch', 'combat', 'issues', '01-swing.md')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `# 01: Swing\n\n**Status:** ${status}\n`)
  }

  async function addedWorkspace(path: string): Promise<Workspace> {
    const group = deriveRepoGroup({ workspacePath: path, gitCommonDir: await getCommonDir(path) })
    return { id: 'main', name: 'fs', path, createdAt: 0, profileId: 'default', ...group }
  }

  it('shows a ticket in progress in an agent worktree with its branch and note, and skips deleted and scratch-less worktrees', async () => {
    const root = mkdtempSync(join(tmpdir(), 'board-wt-'))
    roots.push(root)
    const main = join(root, 'fs')
    mkdirSync(main)
    git(main, 'init', '-q', '-b', 'main')
    ticketAt(main, 'ready-for-agent')
    git(main, 'add', '.')
    git(main, 'commit', '-q', '-m', 'ticket')
    const agent = join(root, 'cc-agent')
    const gone = join(root, 'cc-gone')
    git(main, 'worktree', 'add', '-q', '-b', 'feature/x', agent)
    git(main, 'worktree', 'add', '-q', '-b', 'feature/gone', gone)
    git(main, 'worktree', 'add', '-q', '--detach', join(root, 'no-scratch'))
    rmSync(join(root, 'no-scratch', '.scratch'), { recursive: true, force: true })
    rmSync(gone, { recursive: true, force: true })
    ticketAt(agent, 'in-progress')
    writeFileSync(join(agent, '.scratch', 'combat', 'progress.md'), '- 01 started in the worktree\n')

    const workspaces = [await addedWorkspace(main)]
    const lister = createWorktreeLister({ listPorcelain: listWorktreesPorcelain, files: nodeFileReader })
    const extras = await lister.extras(workspaces)
    expect(extras).toEqual([{ repoGroupKey: workspaces[0].repoGroupKey, path: agent, worktreeTag: 'feature/x' }])

    const [feature] = (await readBoard(workspaces, nodeFileReader, extras)).repoGroups[0].features
    expect(feature.progress.lastNote).toBe('- 01 started in the worktree')
    expect(feature.sightings.map((s) => s.worktreeTag)).toEqual(['', 'feature/x'])
    const [card] = feature.tickets
    expect(card).toMatchObject({ column: 'in-progress', status: 'in-progress' })
    expect(card.sightings.map((s) => [s.worktreeTag, s.column])).toEqual([
      ['feature/x', 'in-progress'],
      ['', 'backlog']
    ])
  }, 30_000)

  it('lists a repo once per 30 s and again after that', async () => {
    let now = 0
    let calls = 0
    const lister = createWorktreeLister({
      listPorcelain: async () => {
        calls++
        return ''
      },
      files: nodeFileReader,
      now: () => now
    })
    const ws: Workspace = { id: 'w', name: 'w', path: 'C:/x/fs', createdAt: 0, profileId: 'd', repoGroupKey: 'git:c:/x/fs/.git', repoName: 'fs', worktreeTag: '' }
    const folder: Workspace = { ...ws, id: 'f', path: 'C:/y', repoGroupKey: 'dir:c:/y' }
    await lister.extras([ws, folder])
    now = 29_999
    await lister.extras([ws, folder])
    expect(calls).toBe(1)
    now = 30_000
    await lister.extras([ws, folder])
    expect(calls).toBe(2)
  })
})
