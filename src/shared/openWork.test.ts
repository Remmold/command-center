import { describe, expect, it } from 'vitest'
import { formatOpenWork, type OpenBranch, type OpenWorkReport, type OpenWorkspaceReport } from './openWork'

const DAY = 86_400_000
const NOW = 100 * DAY

const ws = (over: Partial<OpenWorkspaceReport>): OpenWorkspaceReport => ({ workspaceId: 'a', label: 'repo', path: 'C:\\r\\a', mainBranch: 'main', items: [], missing: [], ...over })
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
