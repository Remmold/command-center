import { describe, expect, it } from 'vitest'
import type { ObservedSession, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import { accountSections, sessionList, shownRows, waitingRows, type HostedSessionInput, type SessionListInput } from './sessionList'
import type { Account } from './accounts'

const workspace = (id: string, repoName: string, worktreeTag = ''): Workspace => ({
  id,
  name: worktreeTag ? `${repoName}-${worktreeTag}` : repoName,
  path: `C:/src/${id}`,
  createdAt: 0,
  profileId: 'default',
  repoGroupKey: `key-${repoName}`,
  repoName,
  worktreeTag
})

const WORKSPACES = [workspace('cc', 'command-center'), workspace('mm', 'mmorpg', 'shard-2')]

const hosted = (paneId: string, title: string, lastActivityAt = 0, workspaceId = 'cc'): HostedSessionInput => ({
  paneId,
  workspaceId,
  title,
  lastActivityAt
})

const status = (paneId: string, s: SessionStatus, since: number): SessionStatusEntry => ({
  paneId,
  cwd: 'C:/src',
  status: s,
  since
})

const observed = (sessionId: string, title: string, modifiedAt: number, s: ObservedSession['status'] = 'quiet'): ObservedSession => ({
  workspaceId: 'cc',
  sessionId,
  title,
  modifiedAt,
  status: s
})

function input(over: Partial<SessionListInput>): SessionListInput {
  return { hosted: [], statuses: [], observed: [], workspaces: WORKSPACES, identities: {}, search: '', ...over }
}

const shape = (list: ReturnType<typeof sessionList>) => list.map((g) => [g.id, g.rows.map((r) => r.title)])

describe('session list', () => {
  it("carries a hosted session's model · effort tag onto its row", () => {
    const list = sessionList(input({ hosted: [{ ...hosted('a', 'one'), modelTag: 'Opus 5.5 · High' }, hosted('b', 'two')] }))
    const rows = list.flatMap((g) => g.rows)
    expect(rows.map((r) => (r.kind === 'hosted' ? r.modelTag : null))).toEqual(['Opus 5.5 · High', undefined])
  })

  it('groups sessions as Needs you, Running, Idle, In VS Code, leaving out empty groups', () => {
    const list = sessionList(
      input({
        hosted: [hosted('a', 'idle one'), hosted('b', 'running one'), hosted('c', 'approval one'), hosted('d', 'turn one')],
        statuses: [status('b', 'running', 5), status('c', 'needs-approval', 5), status('d', 'your-turn', 6)],
        observed: [observed('o1', 'vscode one', 5)]
      })
    )
    expect(shape(list)).toEqual([
      ['needs-you', ['approval one', 'turn one']],
      ['running', ['running one']],
      ['idle', ['idle one']],
      ['in-vscode', ['vscode one']]
    ])
    expect(shape(sessionList(input({ hosted: [hosted('a', 'only')] })))).toEqual([['idle', ['only']]])
  })

  it('puts the most recent activity first within Running, Idle and In VS Code', () => {
    const list = sessionList(
      input({
        hosted: [
          hosted('r-old', 'running old', 100),
          hosted('r-new', 'running new', 300),
          hosted('i-old', 'idle old', 50),
          hosted('i-new', 'idle new', 400)
        ],
        statuses: [status('r-old', 'running', 100), status('r-new', 'running', 300)],
        observed: [observed('o-old', 'vscode old', 10), observed('o-new', 'vscode new', 900, 'live')]
      })
    )
    expect(shape(list)).toEqual([
      ['running', ['running new', 'running old']],
      ['idle', ['idle new', 'idle old']],
      ['in-vscode', ['vscode new', 'vscode old']]
    ])
  })

  it('keeps Needs you in queue order, longest wait first, whatever the recent activity', () => {
    const list = sessionList(
      input({
        hosted: [hosted('late', 'waited least', 999), hosted('early', 'waited longest', 1), hosted('mid', 'waited some', 500)],
        statuses: [status('late', 'your-turn', 300), status('early', 'needs-approval', 100), status('mid', 'your-turn', 200)]
      })
    )
    expect(shape(list)).toEqual([['needs-you', ['waited longest', 'waited some', 'waited least']]])
  })

  it('lists observed sessions only under In VS Code, Live ones too', () => {
    const list = sessionList(input({ observed: [observed('live', 'live in vscode', 2, 'live'), observed('q', 'quiet in vscode', 1)] }))
    expect(shape(list)).toEqual([['in-vscode', ['live in vscode', 'quiet in vscode']]])
    expect(list[0].rows.every((r) => r.kind === 'observed')).toBe(true)
  })

  it('leaves out closed sessions, even when their last status is still known', () => {
    const list = sessionList(
      input({
        hosted: [hosted('open', 'still open')],
        statuses: [status('closed', 'your-turn', 1), status('open', 'running', 2)]
      })
    )
    expect(shape(list)).toEqual([['running', ['still open']]])
  })

  describe('search', () => {
    const sessions: Partial<SessionListInput> = {
      hosted: [hosted('a', 'Fix login bug', 3), hosted('b', 'Tune spawn rates', 2, 'mm')],
      observed: [observed('o', 'Refactor board reader', 1)],
      identities: { 'key-mmorpg': { displayName: 'Darkfall' } }
    }
    const titles = (search: string) => sessionList(input({ ...sessions, search })).flatMap((g) => g.rows.map((r) => r.title))

    it('matches the title, ignoring case', () => {
      expect(titles('LOGIN')).toEqual(['Fix login bug'])
    })

    it('matches the repo display name and the worktree tag', () => {
      expect(titles('darkfall')).toEqual(['Tune spawn rates'])
      expect(titles('shard-2')).toEqual(['Tune spawn rates'])
      expect(titles('command-center')).toEqual(['Fix login bug', 'Refactor board reader'])
    })

    it('needs every word to match somewhere', () => {
      expect(titles('shard spawn')).toEqual(['Tune spawn rates'])
      expect(titles('shard login')).toEqual([])
    })

    it('shows everything for a blank search', () => {
      expect(titles('   ')).toHaveLength(3)
    })
  })
})

describe('account sections', () => {
  const ACCOUNTS: Account[] = [
    { profileId: 'default', name: 'a@home.com', plan: 'Max', label: 'a@home.com · Max' },
    { profileId: 'p-work', name: 'Work', plan: 'Team', label: 'Work · Team' }
  ]
  const workWs = { ...workspace('wk', 'work-repo'), profileId: 'p-work' }
  const sessions: Partial<SessionListInput> = {
    workspaces: [...WORKSPACES, workWs],

    hosted: [hosted('w1', 'work waiting', 0, 'wk'), hosted('h1', 'home running', 0), hosted('h2', 'home waiting', 0), hosted('w2', 'work idle', 0, 'wk')],
    statuses: [status('w1', 'your-turn', 1), status('h1', 'running', 2), status('h2', 'needs-approval', 3)],
    observed: [observed('o', 'home vscode', 1)]
  }
  const sections = () => accountSections(sessionList(input(sessions)), ACCOUNTS)

  it('puts each account in its own section, in Settings order, with the status groups inside', () => {
    expect(sections().map((s) => [s.account.label, s.groups.map((g) => [g.id, g.rows.map((r) => r.title)])])).toEqual([
      ['a@home.com · Max', [['needs-you', ['home waiting']], ['running', ['home running']], ['in-vscode', ['home vscode']]]],
      ['Work · Team', [['needs-you', ['work waiting']], ['idle', ['work idle']]]]
    ])
  })

  it("counts each account's waiting sessions for its header badge", () => {
    expect(sections().map((s) => s.needsYou)).toEqual([1, 1])
  })

  it('leaves out accounts without sessions and puts sessions of a removed profile under the default account', () => {
    const orphan = { ...workspace('or', 'orphan'), profileId: 'gone' }
    const list = sessionList(input({ workspaces: [...WORKSPACES, orphan], hosted: [hosted('x', 'orphan one', 0, 'or')] }))
    expect(accountSections(list, ACCOUNTS).map((s) => [s.account.profileId, s.groups[0].rows[0].title])).toEqual([['default', 'orphan one']])
  })

  it('numbers rows for Alt+1..9 in the order shown, skipping collapsed sections', () => {
    expect(shownRows(sections(), []).map((r) => r.title)).toEqual(['home waiting', 'home running', 'home vscode', 'work waiting', 'work idle'])
    expect(shownRows(sections(), ['default']).map((r) => r.title)).toEqual(['work waiting', 'work idle'])
  })

  it('queues waiting sessions for Ctrl+Shift+J in the order shown, collapsed sections included', () => {
    const more = { ...sessions, statuses: [...sessions.statuses!, status('w2', 'your-turn', 0)] }
    const list = accountSections(sessionList(input(more)), ACCOUNTS)
    expect(waitingRows(list).map((r) => r.title)).toEqual(['home waiting', 'work idle', 'work waiting'])
  })
})
