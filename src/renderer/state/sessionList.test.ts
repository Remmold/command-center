import { describe, expect, it } from 'vitest'
import type { ObservedSession, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import { sessionList, type HostedSessionInput, type SessionListInput } from './sessionList'

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
