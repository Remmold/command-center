import { describe, expect, it } from 'vitest'
import { latestRuns, pathKey, readFindingsRun, shownFindings, type Finding, type FindingsRun } from './findings'

const RUN: FindingsRun = {
  version: 1,
  check: 'drift',
  scope: 'project',
  runId: 'r1',
  sessionId: 's1',
  startedAt: '2026-11-20T10:00:00.000Z',
  accountFolder: 'C:\\Users\\a\\.claude',
  workspaces: ['C:\\projects\\one'],
  steps: [{ id: 'memory', title: 'Memory files', status: 'running' }],
  findings: [
    { id: 'F1', path: 'C:\\projects\\one\\CLAUDE.md', verdict: 'stale', severity: 'problem', claim: 'Says pnpm test runs Jest', evidence: 'vitest.config.ts', fix: 'Say Vitest', status: 'open' }
  ],
  done: false
}

const text = (run: unknown): string => JSON.stringify(run, null, 2)

describe('readFindingsRun', () => {
  it('reads a valid run file', () => {
    expect(readFindingsRun(text(RUN), null)).toEqual({ run: RUN, writing: false, note: null })
  })

  it('keeps the last good parse and says the run is writing when the file is half-written', () => {
    const half = text({ ...RUN, done: true }).slice(0, 120)
    expect(readFindingsRun(half, RUN)).toEqual({ run: RUN, writing: true, note: null })
  })

  it('says the run is writing, with nothing to show, when the first read is half-written', () => {
    expect(readFindingsRun('', null)).toEqual({ run: null, writing: true, note: null })
  })

  it('treats a file that parses but breaks the schema like a half-written one', () => {
    expect(readFindingsRun(text({ ...RUN, findings: [{ id: 'F1' }] }), RUN)).toEqual({ run: RUN, writing: true, note: null })
    expect(readFindingsRun(text({ ...RUN, steps: 'none' }), null)).toEqual({ run: null, writing: true, note: null })
  })

  it('refuses an unknown version with a note, keeping the last good parse', () => {
    const read = readFindingsRun(text({ ...RUN, version: 2 }), RUN)
    expect(read.run).toBe(RUN)
    expect(read.writing).toBe(false)
    expect(read.note).toBe('This run file is version 2; this app reads version 1 only.')
    expect(readFindingsRun(text({ ...RUN, version: 2 }), null).run).toBeNull()
  })
})

const ACC_A = 'C:\\Users\\a\\.claude'
const ACC_B = 'C:\\Users\\b\\.claude-work'
const ONE = 'C:\\projects\\one'
const TWO = 'C:\\projects\\two'
const THREE = 'C:\\projects\\three'

const run = (runId: string, scope: FindingsRun['scope'], accountFolder: string, workspaces: string[], startedAt: string): { run: FindingsRun } => ({
  run: { ...RUN, runId, scope, accountFolder, workspaces, startedAt }
})

describe('latestRuns', () => {
  // Two workspaces on account A, one on account B.
  const runs = [
    run('one-old', 'project', ACC_A, [ONE], '2026-11-10T09:00:00Z'),
    run('one', 'project', ACC_A, [ONE], '2026-11-20T09:00:00Z'),
    run('across', 'cross-project', ACC_A, [ONE, TWO], '2026-11-15T09:00:00Z'),
    run('account', 'account', ACC_A, [TWO], '2026-11-21T09:00:00Z'),
    run('three', 'project', ACC_B, [THREE], '2026-11-22T09:00:00Z')
  ]
  const ids = (picked: ReturnType<typeof latestRuns>) => ({ covering: picked.covering?.run.runId ?? null, account: picked.account?.run.runId ?? null })

  it('shows the newest run covering the workspace, plus the newer account run of its account', () => {
    expect(ids(latestRuns(runs, ONE, ACC_A))).toEqual({ covering: 'one', account: 'account' })
  })

  it('leaves out an account run older than the run covering the workspace, whose account-file findings are newer', () => {
    const later = [...runs, run('one-new', 'project', ACC_A, [ONE], '2026-11-24T09:00:00Z')]
    expect(ids(latestRuns(later, ONE, ACC_A))).toEqual({ covering: 'one-new', account: null })
  })

  it('shows the account run once when it is also the newest run covering the workspace', () => {
    expect(ids(latestRuns(runs, TWO, ACC_A))).toEqual({ covering: 'account', account: null })
  })

  it('never shows another account\'s runs', () => {
    expect(ids(latestRuns(runs, THREE, ACC_B))).toEqual({ covering: 'three', account: null })
  })

  it('shows a cross-project run on each covered workspace when it is the newest', () => {
    const later = [...runs, run('across-new', 'cross-project', ACC_A, [ONE, TWO], '2026-11-23T09:00:00Z')]
    expect(ids(latestRuns(later, ONE, ACC_A))).toEqual({ covering: 'across-new', account: null })
    expect(ids(latestRuns(later, TWO, ACC_A))).toEqual({ covering: 'across-new', account: null })
  })

  it('matches workspace and account paths whatever their case and slashes', () => {
    expect(ids(latestRuns(runs, 'c:/Projects/ONE/', 'c:/users/A/.claude'))).toEqual({ covering: 'one', account: 'account' })
  })

  it('shows nothing for a workspace no run covers', () => {
    expect(ids(latestRuns(runs, 'C:\\projects\\four', 'C:\\Users\\c\\.claude'))).toEqual({ covering: null, account: null })
  })
})

describe('pathKey', () => {
  it('folds case, backslashes and a trailing slash', () => {
    expect(pathKey('C:\\Projects\\One\\CLAUDE.md')).toBe(pathKey('c:/projects/one/claude.md'))
    expect(pathKey('C:\\projects\\one\\')).toBe(pathKey('C:\\projects\\one'))
  })
})

describe('shownFindings', () => {
  const STARTED = Date.parse(RUN.startedAt)
  const finding = (id: string, path: string): Finding => ({ ...RUN.findings[0], id, path })
  const repoFile = `${ONE}\\CLAUDE.md`
  const accountFile = `${ACC_A}\\CLAUDE.md`
  const withFindings = { ...RUN, findings: [finding('F1', repoFile), finding('F2', accountFile)] }

  it('marks a finding stale when its file was modified after the run started', () => {
    const modified = { [pathKey(repoFile)]: STARTED + 1, [pathKey(accountFile)]: STARTED }
    const shown = shownFindings(withFindings, modified, ACC_A, 'all')
    expect(shown.map((f) => [f.id, f.stale])).toEqual([
      ['F1', true],
      ['F2', false]
    ])
  })

  it('never marks a finding stale whose file is gone or whose run has no readable start', () => {
    expect(shownFindings(withFindings, { [pathKey(repoFile)]: null }, ACC_A, 'all')[0].stale).toBe(false)
    expect(shownFindings({ ...withFindings, startedAt: 'soon' }, { [pathKey(repoFile)]: STARTED + 1 }, ACC_A, 'all')[0].stale).toBe(false)
  })

  it('marks findings on account files as affecting every workspace of the account', () => {
    const shown = shownFindings({ ...withFindings, findings: [finding('F1', repoFile), finding('F2', 'c:/users/a/.claude/CLAUDE.md')] }, {}, ACC_A, 'all')
    expect(shown.map((f) => [f.id, f.accountWide])).toEqual([
      ['F1', false],
      ['F2', true]
    ])
  })

  it('keeps only the account-file findings of a run shown for its account, and the others of the run it is newer than', () => {
    expect(shownFindings(withFindings, {}, ACC_A, 'account').map((f) => f.id)).toEqual(['F2'])
    expect(shownFindings(withFindings, {}, ACC_A, 'not-account').map((f) => f.id)).toEqual(['F1'])
  })

  it('tags each finding with its run', () => {
    expect(shownFindings(withFindings, {}, ACC_A, 'all').every((f) => f.runId === RUN.runId)).toBe(true)
  })
})
