import { describe, expect, it } from 'vitest'
import { formatOpenWork, type OpenBranch, type OpenWorkReport, type OpenWorkspaceReport } from './openWork'

const DAY = 86_400_000
const NOW = 100 * DAY

const ws = (over: Partial<OpenWorkspaceReport>): OpenWorkspaceReport => ({ workspaceId: 'a', label: 'repo', path: 'C:\\r\\a', mainBranch: 'main', items: [], missing: [], merged: [], ...over })
const branch = (name: string, daysAgo: number): OpenBranch => ({ kind: 'branch', branch: name, lastCommitAt: NOW - daysAgo * DAY, ahead: 1 })

describe('formatOpenWork', () => {
  it('renders each kind on one line, newest first', () => {
    const report: OpenWorkReport = {
      scannedAt: NOW,
      workspaces: [
        ws({
          items: [
            branch('old', 30),
            { kind: 'worktree', path: 'C:\\r\\wt', branch: null, lastCommitAt: NOW - 2 * DAY, ahead: 3, dirty: true, session: { id: 'abc', mtime: 1 } },
            { kind: 'main-checkout', path: 'C:\\r\\a', branch: 'rewrite', lastCommitAt: NOW - 5 * DAY, ahead: 7, dirty: false, session: null }
          ],
          missing: [{ path: 'C:\\r\\gone', branch: 'g' }]
        }),
        ws({ label: 'empty' }),
        ws({ label: 'broken', error: 'git timed out' })
      ]
    }
    expect(formatOpenWork(report).split('\n').slice(4)).toEqual([
      '## repo (C:\\r\\a, main main)',
      '- worktree (detached) · C:\\r\\wt · 2d · ahead 3 · dirty · session abc',
      '- main-checkout rewrite · C:\\r\\a · 5d · ahead 7 · clean · no session',
      '- branch old · 30d · ahead 1',
      '- missing worktrees: C:\\r\\gone (g)',
      '',
      '## broken (C:\\r\\a, main main)',
      'error: git timed out',
      ''
    ])
  })

  it('caps a workspace at 15 items with "and N more"', () => {
    const items = Array.from({ length: 18 }, (_, i) => branch(`b${i}`, i))
    const lines = formatOpenWork({ scannedAt: NOW, workspaces: [ws({ items })] }).trim().split('\n')
    expect(lines.filter((l) => l.startsWith('- branch'))).toHaveLength(15)
    expect(lines.at(-1)).toBe('- and 3 more')
    expect(lines).toContain('- branch b0 · 0d · ahead 1')
    expect(lines).not.toContain('- branch b17 · 17d · ahead 1')
  })

  it('says so when nothing is open', () => {
    expect(formatOpenWork({ scannedAt: NOW, workspaces: [ws({})] })).toContain('Nothing open.')
  })
})

describe('the Merged, deletable line', () => {
  const merged = (name: string, daysAgo: number | null) => ({ branch: name, lastCommitAt: daysAgo === null ? null : NOW - daysAgo * DAY })
  const lineOf = (w: OpenWorkspaceReport): string[] => formatOpenWork({ scannedAt: NOW, workspaces: [w] }).split('\n').filter((l) => l.startsWith('- Merged, deletable:'))

  it('is left out when there are none', () => {
    expect(lineOf(ws({ items: [branch('wip', 1)] }))).toEqual([])
  })

  it('lists a few newest first, and alone still shows its workspace', () => {
    const text = formatOpenWork({ scannedAt: NOW, workspaces: [ws({ merged: [merged('old', 40), merged('new', 1), merged('none', null), merged('mid', 9)] })] })
    expect(text).not.toContain('Nothing open.')
    expect(text).toContain('## repo (C:\\r\\a, main main)')
    expect(lineOf(ws({ merged: [merged('old', 40), merged('new', 1), merged('none', null), merged('mid', 9)] }))).toEqual(['- Merged, deletable: new, mid, old, none'])
  })

  it('names at most 15, then "and N more"', () => {
    const all = Array.from({ length: 19 }, (_, i) => merged(`m${i}`, i))
    expect(lineOf(ws({ merged: all }))).toEqual([`- Merged, deletable: ${all.slice(0, 15).map((b) => b.branch).join(', ')} … and 4 more`])
  })
})
