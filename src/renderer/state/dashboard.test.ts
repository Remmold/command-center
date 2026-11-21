import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import type { ObservedSession, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import { dashboard, type DashboardInput } from './dashboard'
import type { HostedSessionInput } from './sessionList'

const NOW = 1_800_000_000_000

const workspace = (id: string, repoName: string, worktreeTag = '', profileId = 'default'): Workspace => ({
  id,
  name: worktreeTag ? `${repoName}-${worktreeTag}` : repoName,
  path: `C:/src/${id}`,
  createdAt: 0,
  profileId,
  repoGroupKey: `key-${repoName}`,
  repoName,
  worktreeTag
})

const WORKSPACES = [workspace('cc', 'command-center'), workspace('mm', 'mmorpg', 'shard-2')]

const hosted = (paneId: string, title: string, workspaceId = 'cc'): HostedSessionInput => ({
  paneId,
  workspaceId,
  title,
  lastActivityAt: 0
})

const status = (paneId: string, s: SessionStatus, since: number): SessionStatusEntry => ({
  paneId,
  cwd: 'C:/src',
  status: s,
  since
})

const observed = (sessionId: string, title: string, s: ObservedSession['status'], modifiedAt = 0): ObservedSession => ({
  workspaceId: 'cc',
  sessionId,
  title,
  modifiedAt,
  status: s
})

function input(over: Partial<DashboardInput> = {}): DashboardInput {
  return {
    hosted: [],
    statuses: [],
    observed: [],
    workspaces: WORKSPACES,
    identities: {},
    board: { repoGroups: [] },
    profiles: [],
    tallies: { sessions: {}, profiles: {} },
    rateLimits: {},
    chatItems: {},
    observedTail: null,
    now: NOW,
    ...over
  }
}

describe('dashboard: needs you', () => {
  it('lists every waiting session, longest wait first, and nothing else', () => {
    const d = dashboard(
      input({
        hosted: [hosted('new', 'newest wait'), hosted('old', 'oldest wait', 'mm'), hosted('run', 'running'), hosted('idle', 'idle')],
        statuses: [status('new', 'your-turn', 300), status('old', 'needs-approval', 100), status('run', 'running', 50)]
      })
    )
    expect(d.needsYou.map((r) => [r.title, r.status, r.statusSince, r.workspace.worktreeTag])).toEqual([
      ['oldest wait', 'needs-approval', 100, 'shard-2'],
      ['newest wait', 'your-turn', 300, '']
    ])
  })
})

describe('dashboard: live sessions', () => {
  it('has a card for exactly the Running, Needs approval and Your turn sessions plus observed Live ones', () => {
    const d = dashboard(
      input({
        hosted: [hosted('run', 'running'), hosted('appr', 'approval'), hosted('turn', 'turn'), hosted('idle', 'idle'), hosted('fresh', 'no status')],
        statuses: [status('run', 'running', 10), status('appr', 'needs-approval', 20), status('turn', 'your-turn', 30), status('idle', 'idle', 40)],
        observed: [observed('o-live', 'vscode live', 'live'), observed('o-quiet', 'vscode quiet', 'quiet')]
      })
    )
    expect(d.live.map((c) => c.row.title).sort()).toEqual(['approval', 'running', 'turn', 'vscode live'])
  })

  it('dates a hosted card by its last status change and an observed card by its transcript', () => {
    const d = dashboard(
      input({
        hosted: [hosted('run', 'running')],
        statuses: [status('run', 'running', 500)],
        observed: [observed('o', 'vscode', 'live', 900)]
      })
    )
    expect(d.live.map((c) => [c.row.title, c.lastEventAt])).toEqual([
      ['vscode', 900],
      ['running', 500]
    ])
  })
})

const user = (id: string, text: string): ChatItem => ({ kind: 'user', id, text })
const assistant = (id: string, ...blocks: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }>): ChatItem => ({
  kind: 'assistant',
  id,
  content: blocks,
  raw: { type: 'assistant', message: { role: 'assistant', content: blocks } } as never
})
const text = (t: string) => ({ type: 'text' as const, text: t })

describe('dashboard: live session snippet', () => {
  it('is the text of the last assistant message, as plain text', () => {
    const d = dashboard(
      input({
        hosted: [hosted('run', 'running')],
        statuses: [status('run', 'running', 10)],
        chatItems: {
          run: [
            assistant('a1', text('first answer')),
            user('u1', 'next please'),
            assistant('a2', text('## Done\n\nI fixed **the bug** in `parse()`.\n\n- see [the docs](http://x)')),
            user('u2', 'thanks')
          ]
        }
      })
    )
    expect(d.live[0].snippet).toBe('Done I fixed the bug in parse(). see the docs')
  })

  it('skips assistant messages that only call tools, and is null before any text', () => {
    const tool = { type: 'tool_use' as const, id: 't', name: 'Read', input: {} }
    const d = dashboard(
      input({
        hosted: [hosted('a', 'with text'), hosted('b', 'tools only')],
        statuses: [status('a', 'running', 20), status('b', 'running', 10)],
        chatItems: { a: [assistant('a1', text('reading the file')), assistant('a2', tool)], b: [assistant('b1', tool)] }
      })
    )
    expect(d.live.map((c) => c.snippet)).toEqual(['reading the file', null])
  })

  it('comes from the tail for the observed session being followed, and is null for other observed ones', () => {
    const d = dashboard(
      input({
        observed: [observed('followed', 'followed', 'live', 20), observed('other', 'other', 'live', 10)],
        observedTail: { workspaceId: 'cc', sessionId: 'followed', items: [assistant('x', text('tail text'))] }
      })
    )
    expect(d.live.map((c) => [c.row.title, c.snippet])).toEqual([
      ['followed', 'tail text'],
      ['other', null]
    ])
  })
})

describe('dashboard: usage per account', () => {
  it('has one row per profile with how full its window is, when it resets, and today\'s tokens', () => {
    const today = new Date(NOW).toISOString().slice(0, 10)
    const resetsAt = NOW / 1000 + 7800
    const d = dashboard(
      input({
        profiles: [
          { id: 'default', name: 'Default' },
          { id: 'work', name: 'Work' }
        ],
        tallies: {
          sessions: {},
          profiles: { default: { todayKey: today, todayCostUsd: 1, tokensByModel: { opus: { input: 1000, output: 200, cacheRead: 30, cacheCreation: 4 } } } }
        },
        rateLimits: { default: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.42, resetsAt } }
      })
    )
    expect(d.usage.map((u) => [u.name, u.window?.percent ?? null, u.window?.resetsAt ?? null, u.todayTokens])).toEqual([
      ['Default', 42, resetsAt, 1234],
      ['Work', null, null, 0]
    ])
  })
})

describe('dashboard: now building', () => {
  it('lists active features with the status of the sessions open in their workspaces', () => {
    const d = dashboard(
      input({
        hosted: [hosted('run', 'running', 'mm')],
        statuses: [status('run', 'running', 10)],
        board: {
          repoGroups: [
            {
              repoGroupKey: 'key-mmorpg',
              repoName: 'mmorpg',
              features: [
                {
                  name: 'combat',
                  state: 'active',
                  progress: { done: 0, total: 1, lastNote: null },
                  lastActivity: NOW - 60_000,
                  tickets: [],
                  sightings: [{ workspaceId: 'mm', specPath: null, progressPath: null, lastActivity: NOW - 60_000 }]
                }
              ]
            }
          ]
        }
      })
    )
    expect(d.nowBuilding.rows.map((r) => [r.featureName, r.status, r.worktreeTag])).toEqual([['combat', 'running', 'shard-2']])
  })
})

describe('dashboard: empty', () => {
  it('has every section empty when nothing is going on', () => {
    const d = dashboard(input({ hosted: [hosted('idle', 'idle')], observed: [observed('q', 'quiet', 'quiet')] }))
    expect([d.needsYou, d.nowBuilding.rows, d.nowBuilding.hidden, d.live, d.usage]).toEqual([[], [], [], [], []])
  })
})
