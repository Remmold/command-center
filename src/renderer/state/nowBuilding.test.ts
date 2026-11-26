import { describe, expect, it } from 'vitest'
import type { BoardColumn, BoardFeature, BoardModel, BoardTicket, FeatureState, SessionStatus } from '../../shared/types'
import { nowBuilding, showOnlyFeature, timeAgo, toggleFeatureFilter, type NowBuildingInput } from './nowBuilding'

const HOUR = 60 * 60 * 1000
const NOW = 1_800_000_000_000

function ticket(number: string, column: BoardColumn): BoardTicket {
  return {
    number,
    fileName: `${number}-t.md`,
    title: `ticket ${number}`,
    column,
    status: null,
    statusNote: null,
    statusLine: null,
    statusKnown: true,
    summary: null,
    sightings: []
  }
}

interface FeatureSpec {
  tickets?: BoardTicket[]
  state?: FeatureState
  /** Activity per workspace id. */
  copies?: Record<string, number | null>
  /** Worktree tag per workspace id; missing means a main checkout. */
  tags?: Record<string, string>
}

function feature(name: string, spec: FeatureSpec = {}): BoardFeature {
  const tickets = spec.tickets ?? [ticket('01', 'backlog')]
  const copies = spec.copies ?? { main: null }
  const sightings = Object.entries(copies).map(([workspaceId, lastActivity]) => ({
    workspaceId,
    worktreeTag: spec.tags?.[workspaceId] ?? '',
    specPath: null,
    progressPath: null,
    lastActivity
  }))
  const times = sightings.map((s) => s.lastActivity).filter((t): t is number => t !== null)
  const done = tickets.filter((t) => t.column === 'done').length
  return {
    name,
    state: spec.state ?? (done === tickets.length ? 'finished' : 'active'),
    progress: { done, total: tickets.length, lastNote: null },
    lastActivity: times.length > 0 ? Math.max(...times) : null,
    tickets,
    sightings
  }
}

function model(...features: BoardFeature[]): BoardModel {
  return { repoGroups: [{ repoGroupKey: 'git:fs', repoName: 'FantasySurvival', features }] }
}

function input(m: BoardModel, statuses: Record<string, SessionStatus[]> = {}): NowBuildingInput {
  return { model: m, statuses, now: NOW }
}

function names(m: BoardModel, statuses: Record<string, SessionStatus[]> = {}): string[] {
  return nowBuilding(input(m, statuses)).rows.map((r) => r.featureName)
}

describe('now building: which features are active', () => {
  it('lists a feature with a ticket in In progress, however old its files are', () => {
    const m = model(
      feature('combat', { tickets: [ticket('01', 'in-progress'), ticket('02', 'backlog')], copies: { main: NOW - 30 * 24 * HOUR } }),
      feature('quiet', { copies: { main: NOW - 30 * 24 * HOUR } })
    )
    expect(names(m)).toEqual(['combat'])
  })

  it('lists a feature whose files changed within the last 24 hours, up to and including the edge', () => {
    const m = model(
      feature('edge', { copies: { main: NOW - 24 * HOUR } }),
      feature('just-past', { copies: { main: NOW - 24 * HOUR - 1 } }),
      feature('never', { copies: { main: null } })
    )
    expect(names(m)).toEqual(['edge'])
  })

  it('lists a Running workspace’s most recently active feature, and only that one', () => {
    const m = model(
      feature('older', { copies: { main: NOW - 50 * HOUR } }),
      feature('newer', { copies: { main: NOW - 40 * HOUR } }),
      feature('elsewhere', { copies: { shard: NOW - 30 * HOUR } })
    )
    expect(names(m, { main: ['running'] })).toEqual(['newer'])
    expect(names(m, { main: ['your-turn', 'idle'] })).toEqual([])
  })

  it('judges “most recently active” by the workspace’s own copy, not the feature’s newest copy', () => {
    const m = model(
      feature('busy-in-shard', { copies: { main: NOW - 60 * HOUR, shard: NOW - 30 * HOUR } }),
      feature('main-work', { copies: { main: NOW - 50 * HOUR } })
    )
    expect(names(m, { main: ['running'] })).toEqual(['main-work'])
  })

  it('lists a finished feature only through recent file changes, marked finished', () => {
    const done = [ticket('01', 'done')]
    const recent = model(feature('shipped', { tickets: done, copies: { main: NOW - HOUR } }))
    expect(nowBuilding(input(recent)).rows).toMatchObject([{ featureName: 'shipped', finished: true }])

    const stale = model(feature('shipped', { tickets: done, copies: { main: NOW - 48 * HOUR } }))
    expect(names(stale, { main: ['running'] })).toEqual([])
  })
})

describe('now building: rows', () => {
  it('orders rows newest activity first, features without a time last', () => {
    const m = model(
      feature('a', { copies: { main: NOW - 3 * HOUR } }),
      feature('b', { copies: { main: NOW - HOUR } }),
      feature('c', { tickets: [ticket('01', 'in-progress')], copies: { main: null } }),
      feature('d', { copies: { main: NOW - 2 * HOUR } })
    )
    expect(names(m)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('shows at most 6 rows and counts the rest as hidden', () => {
    const features = Array.from({ length: 8 }, (_, i) => feature(`f${i}`, { copies: { main: NOW - i * HOUR } }))
    const result = nowBuilding(input(model(...features)))
    expect(result.rows.map((r) => r.featureName)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5'])
    expect(result.hidden.map((r) => r.featureName)).toEqual(['f6', 'f7'])
    expect(result.count).toBe(8)
  })

  it('shows the most urgent session status among the feature’s workspaces, none when no session is open', () => {
    const m = model(
      feature('both', { copies: { main: NOW - HOUR, shard: NOW - 2 * HOUR } }),
      feature('none', { copies: { other: NOW - 3 * HOUR } })
    )
    const rows = nowBuilding(input(m, { main: ['running', 'idle'], shard: ['your-turn'], other: [], ghost: ['needs-approval'] })).rows
    expect(rows.map((r) => [r.featureName, r.status])).toEqual([
      ['both', 'your-turn'],
      ['none', null]
    ])
  })

  it('lists the in-progress tickets and tags a row whose recent changes are only in a worktree', () => {
    const tags = { shard: 'shard-2' }
    const m = model(
      feature('combat', {
        tickets: [ticket('01', 'done'), ticket('03', 'in-progress'), ticket('02', 'in-progress')],
        copies: { main: NOW - 40 * HOUR, shard: NOW - HOUR },
        tags
      }),
      feature('camera', { copies: { main: NOW - 3 * HOUR, shard: NOW - 2 * HOUR }, tags }),
      feature('stale', { tickets: [ticket('01', 'in-progress')], copies: { main: NOW - 50 * HOUR, shard: NOW - 40 * HOUR }, tags })
    )
    const rows = nowBuilding(input(m)).rows
    expect(rows.map((r) => [r.featureName, r.inProgress.map((t) => t.number), r.worktreeTag])).toEqual([
      ['combat', ['03', '02'], 'shard-2'],
      ['camera', [], null],
      ['stale', ['01'], 'shard-2']
    ])
    expect(rows[0]).toMatchObject({ key: 'git:fs/combat', repoGroupKey: 'git:fs', repoName: 'FantasySurvival', lastActivity: NOW - HOUR })
  })
})

describe('now building: clicking a row', () => {
  const empty = { repoGroupKeys: [], featureKeys: [], search: 'x' }

  it('filters the board to that feature, and clears the filter when clicked again', () => {
    const on = toggleFeatureFilter(empty, 'git:fs', 'git:fs/combat')
    expect(on).toEqual({ repoGroupKeys: [], featureKeys: ['git:fs/combat'], search: 'x' })
    expect(toggleFeatureFilter(on, 'git:fs', 'git:fs/combat')).toEqual(empty)
  })

  it('replaces another feature filter, and drops a repo filter that would hide the feature', () => {
    const other = { repoGroupKeys: ['git:agon'], featureKeys: ['git:agon/x', 'git:agon/y'], search: '' }
    expect(toggleFeatureFilter(other, 'git:fs', 'git:fs/combat')).toEqual({
      repoGroupKeys: [],
      featureKeys: ['git:fs/combat'],
      search: ''
    })
    const sameRepo = { repoGroupKeys: ['git:fs'], featureKeys: [], search: '' }
    expect(toggleFeatureFilter(sameRepo, 'git:fs', 'git:fs/combat').repoGroupKeys).toEqual(['git:fs'])
  })

  it('from the Dashboard always shows that feature, clearing a search that could hide its tickets', () => {
    const on = { repoGroupKeys: ['git:agon'], featureKeys: ['git:fs/combat'], search: 'boss' }
    expect(showOnlyFeature(on, 'git:fs', 'git:fs/combat')).toEqual({ repoGroupKeys: [], featureKeys: ['git:fs/combat'], search: '' })
  })
})

describe('time ago', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [-5 * 60_000, 'just now'],
    [60_000, '1m ago'],
    [2 * 60_000 + 59_000, '2m ago'],
    [59 * 60_000, '59m ago'],
    [HOUR, '1h ago'],
    [3 * HOUR + 59 * 60_000, '3h ago'],
    [23 * HOUR, '23h ago'],
    [24 * HOUR, '1d ago'],
    [9 * 24 * HOUR, '9d ago']
  ])('%i ms ago reads %s', (age, label) => {
    expect(timeAgo(NOW - age, NOW)).toBe(label)
  })
})
