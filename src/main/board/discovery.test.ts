import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Workspace } from '../../shared/types'
import { discoverRepos, type DiscoveryDeps } from './discovery'
import { nodeFileReader } from './nodeFileReader'

const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'discovery-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    if (rel.endsWith('/')) mkdirSync(full, { recursive: true })
    else writeFileSync(full, content)
  }
  return root
}

/** A folder's own `.git` folder is its common dir; a `.git` file names the main checkout as `gitdir: <main>`. */
function deps(): DiscoveryDeps {
  return {
    files: nodeFileReader,
    commonDirOf: async (path) => {
      const git = (await nodeFileReader.listDir(path)).find((e) => e.name === '.git')
      if (!git) return null
      if (git.isDirectory) return join(path, '.git')
      const gitFile = (await nodeFileReader.readFile(join(path, '.git'))) ?? ''
      return join(gitFile.replace(/^gitdir:\s*/, '').trim(), '.git')
    }
  }
}

function ticket(status: string): string {
  return `# Ticket\n\n**Status:** ${status}\n`
}

function added(path: string): Workspace {
  return {
    id: path,
    name: 'ws',
    path,
    createdAt: 0,
    profileId: 'default',
    repoGroupKey: '',
    repoName: '',
    worktreeTag: ''
  }
}

describe('repo discovery', () => {
  it('finds git repos with a feature holding a spec or an issues folder, with feature and open ticket counts', async () => {
    const root = tree({
      'personal/alpha/.git/HEAD': 'ref',
      'personal/alpha/.scratch/combat/spec.md': '# spec',
      'personal/alpha/.scratch/combat/issues/01-a.md': ticket('resolved'),
      'personal/alpha/.scratch/combat/issues/02-b.md': ticket('ready-for-agent'),
      'personal/alpha/.scratch/caves/issues/01-c.md': ticket('done'),
      'personal/alpha/.scratch/caves/progress.md': '- 01 done',
      'personal/alpha/.scratch/scraps/night-notes.md': 'notes only',
      'beta/.git/HEAD': 'ref',
      'beta/.scratch/notes/night-notes.md': 'no spec, no issues',
      'gamma/.git/HEAD': 'ref',
      'gamma/src/index.ts': '',
      'plain/.scratch/f/spec.md': 'not a git repo'
    })
    const repos = await discoverRepos([root], [], deps())
    expect(repos).toEqual([
      {
        repoGroupKey: `git:${join(root, 'personal/alpha/.git').replace(/\\/g, '/').toLowerCase()}`,
        repoName: 'alpha',
        main: { path: join(root, 'personal/alpha'), worktreeTag: '', featureCount: 2, openTicketCount: 1 },
        mainAdded: false,
        worktrees: []
      }
    ])
  })

  it('skips node_modules, Library, Temp and hidden folders, and stops below the depth limit', async () => {
    const qualifying = { '.git/HEAD': 'ref', '.scratch/f/spec.md': '# spec' }
    const at = (prefix: string): Record<string, string> =>
      Object.fromEntries(Object.entries(qualifying).map(([rel, c]) => [`${prefix}/${rel}`, c]))
    const root = tree({
      ...at('one/two/three'),
      ...at('one/two/three/four'),
      ...at('a/b/c/d'),
      ...at('node_modules/pkg'),
      ...at('x/node_modules/pkg'),
      ...at('Library/cache'),
      ...at('game/Temp/copy'),
      ...at('.hidden/repo'),
      ...at('top')
    })
    const repos = await discoverRepos([root], [], deps())
    expect(repos.map((r) => r.main?.path)).toEqual([join(root, 'one/two/three'), join(root, 'top')])
  })

  it('looks no further into a repo than its .scratch', async () => {
    const root = tree({
      'outer/.git/HEAD': 'ref',
      'outer/.scratch/f/spec.md': '# spec',
      'outer/packages/inner/.git/HEAD': 'ref',
      'outer/packages/inner/.scratch/f/spec.md': '# spec'
    })
    const repos = await discoverRepos([root], [], deps())
    expect(repos.map((r) => r.main?.path)).toEqual([join(root, 'outer')])
  })

  it('checks a scan root that is itself a repo', async () => {
    const root = tree({ '.git/HEAD': 'ref', '.scratch/f/issues/01-a.md': ticket('needs-triage') })
    const repos = await discoverRepos([root], [], deps())
    expect(repos.map((r) => [r.main?.path, r.main?.openTicketCount])).toEqual([[root, 1]])
  })

  it('groups worktrees under their repo and leaves out folders already added', async () => {
    const root = tree({
      'FantasySurvival/.git/HEAD': 'ref',
      'FantasySurvival/.scratch/f/spec.md': '# spec',
      'FS-shard-1/.scratch/f/issues/01-a.md': ticket('in-progress'),
      'FS-shard-2/.scratch/f/issues/01-a.md': ticket('resolved'),
      'FS-wt-plain/src/x.ts': ''
    })
    const main = join(root, 'FantasySurvival')
    for (const wt of ['FS-shard-1', 'FS-shard-2', 'FS-wt-plain']) writeFileSync(join(root, wt, '.git'), `gitdir: ${main}`)

    const none = await discoverRepos([root], [], deps())
    expect(none).toHaveLength(1)
    expect(none[0].repoName).toBe('FantasySurvival')
    expect(none[0].main?.path).toBe(main)
    expect(none[0].worktrees).toEqual([
      { path: join(root, 'FS-shard-1'), worktreeTag: 'shard-1', featureCount: 1, openTicketCount: 1 },
      { path: join(root, 'FS-shard-2'), worktreeTag: 'shard-2', featureCount: 1, openTicketCount: 0 }
    ])

    const mainAdded = await discoverRepos([root], [added(main.toUpperCase() + '\\')], deps())
    expect(mainAdded.map((r) => [r.main, r.mainAdded, r.worktrees.map((w) => w.worktreeTag)])).toEqual([
      [null, true, ['shard-1', 'shard-2']]
    ])

    const allAdded = await discoverRepos(
      [root],
      [added(main), added(join(root, 'FS-shard-1')), added(join(root, 'FS-shard-2'))],
      deps()
    )
    expect(allAdded).toEqual([])
  })

  it('offers worktrees of a repo whose main checkout has no tickets, without calling it added', async () => {
    const root = tree({
      'Game/.git/HEAD': 'ref',
      'Game/src/x.ts': '',
      'Game-wt-1/.scratch/f/spec.md': '# spec'
    })
    writeFileSync(join(root, 'Game-wt-1', '.git'), `gitdir: ${join(root, 'Game')}`)
    const repos = await discoverRepos([root], [], deps())
    expect(repos.map((r) => [r.repoName, r.main, r.mainAdded, r.worktrees.map((w) => w.worktreeTag)])).toEqual([
      ['Game', null, false, ['wt-1']]
    ])
  })

  it('lists a folder once when scan roots overlap or differ only by case', async () => {
    const root = tree({ 'group/repo/.git/HEAD': 'ref', 'group/repo/.scratch/f/spec.md': '# spec' })
    const repos = await discoverRepos([root, join(root, 'group'), root.toUpperCase()], [], deps())
    expect(repos.map((r) => r.main?.path)).toEqual([join(root, 'group/repo')])
  })

  it('reads a missing scan root as nothing found', async () => {
    expect(await discoverRepos([join(tmpdir(), 'no-such-root-for-discovery')], [], deps())).toEqual([])
  })
})
