import { describe, expect, it } from 'vitest'
import type { DiscoveredRepo, BoardColumn, BoardFeature, BoardModel, BoardRepoGroup, BoardTicket, FeatureState } from '../../shared/types'
import type { Account } from './accounts'
import { featureOptions, layoutBoard, neighbourCard, notAddedRepos, type BoardLayout, type BoardViewOptions } from './boardLayout'

function ticket(number: string, column: BoardColumn, title = `ticket ${number}`, statusNote: string | null = null): BoardTicket {
  return {
    number,
    fileName: `${number}-${title.replace(/\s+/g, '-')}.md`,
    title,
    column,
    status: column === 'done' ? 'resolved' : 'ready-for-agent',
    statusNote,
    statusLine: null,
    statusKnown: true,
    summary: null,
    sightings: [
      { workspaceId: 'ws', worktreeTag: '', column, blockedBy: [], filePath: `x/${number}.md`, progressPath: null, status: null, statusNote, statusLine: null, statusKnown: true }
    ]
  }
}

function feature(name: string, tickets: BoardTicket[], state?: FeatureState): BoardFeature {
  const done = tickets.filter((t) => t.column === 'done').length
  return {
    name,
    state: state ?? (tickets.length === 0 ? 'spec-only' : done === tickets.length ? 'finished' : 'active'),
    progress: { done, total: tickets.length, lastNote: `${name} note` },
    lastActivity: null,
    tickets,
    sightings: [{ workspaceId: 'ws', worktreeTag: '', specPath: null, progressPath: null, lastActivity: null }]
  }
}

function repo(repoName: string, features: BoardFeature[]): BoardRepoGroup {
  return { repoGroupKey: `key:${repoName}`, repoName, features }
}

const DEFAULTS: BoardViewOptions = {
  filter: { repoGroupKeys: [], featureKeys: [], search: '' },
  groupBy: 'none',
  showFinished: false
}

function view(overrides: Partial<BoardViewOptions> = {}): BoardViewOptions {
  return { ...DEFAULTS, ...overrides }
}

/** Each column as "repo/feature#number" labels, spec-only cards as "repo/feature (spec)". */
function columnsOf(layout: BoardLayout, laneIndex = 0): Record<BoardColumn, string[]> {
  const lane = layout.lanes[laneIndex]
  return Object.fromEntries(
    lane.columns.map((c) => [
      c.column,
      c.cards.map((card) =>
        card.kind === 'ticket' ? `${card.repoName}/${card.feature.name}#${card.ticket.number}` : `${card.repoName}/${card.feature.name} (spec)`
      )
    ])
  ) as Record<BoardColumn, string[]>
}

describe('board layout', () => {
  it('stacks every card in its column, ordered by repo, then feature, then ticket number', () => {
    const model: BoardModel = {
      repoGroups: [
        repo('zeta', [feature('combat', [ticket('01', 'backlog')])]),
        repo('Alpha', [
          feature('mining', [ticket('03', 'backlog'), ticket('02b', 'backlog'), ticket('10', 'blocked'), ticket('02', 'backlog')]),
          feature('caves', [ticket('112', 'in-progress'), ticket('09', 'in-progress'), ticket('01', 'done')])
        ])
      ]
    }
    expect(columnsOf(layoutBoard(model, view()))).toEqual({
      backlog: ['Alpha/mining#02', 'Alpha/mining#02b', 'Alpha/mining#03', 'zeta/combat#01'],
      blocked: ['Alpha/mining#10'],
      'in-progress': ['Alpha/caves#09', 'Alpha/caves#112'],
      done: ['Alpha/caves#01']
    })
  })

  it('hides finished features from Done by default, counting "+N from M", and shows them on request', () => {
    const model: BoardModel = {
      repoGroups: [
        repo('alpha', [
          feature('live', [ticket('01', 'done'), ticket('02', 'backlog')]),
          feature('old', [ticket('01', 'done'), ticket('02', 'done')]),
          feature('older', [ticket('01', 'done')]),
          feature('ideas', [])
        ])
      ]
    }
    const hidden = layoutBoard(model, view())
    const done = hidden.lanes[0].columns.find((c) => c.column === 'done')
    expect(columnsOf(hidden).done).toEqual(['alpha/live#01'])
    expect(done?.finished).toEqual({ cards: 3, features: 2 })
    expect(columnsOf(hidden).backlog).toEqual(['alpha/ideas (spec)', 'alpha/live#02'])

    const shown = layoutBoard(model, view({ showFinished: true }))
    expect(columnsOf(shown).done).toEqual(['alpha/live#01', 'alpha/old#01', 'alpha/old#02', 'alpha/older#01'])
    expect(shown.lanes[0].columns.find((c) => c.column === 'done')?.finished).toEqual({ cards: 3, features: 2 })
  })

  describe('filters', () => {
    const model: BoardModel = {
      repoGroups: [
        repo('alpha', [
          feature('combat', [ticket('01', 'backlog', 'Sword swings'), ticket('02', 'blocked', 'Shields', 'waiting on art')]),
          feature('ideas', [])
        ]),
        repo('beta', [feature('combat', [ticket('01', 'backlog', 'Bow')]), feature('ui', [ticket('07', 'backlog', 'Menus')])])
      ]
    }
    const all = (filter: Partial<BoardViewOptions['filter']>): string[] =>
      Object.values(columnsOf(layoutBoard(model, view({ filter: { ...DEFAULTS.filter, ...filter } })))).flat()

    it('keeps only the selected repos', () => {
      expect(all({ repoGroupKeys: ['key:beta'] })).toEqual(['beta/combat#01', 'beta/ui#07'])
    })

    it('ignores a remembered repo that is no longer on the board', () => {
      expect(all({ repoGroupKeys: ['key:gone'] })).toHaveLength(5)
      expect(all({ repoGroupKeys: ['key:gone', 'key:beta'] })).toEqual(['beta/combat#01', 'beta/ui#07'])
    })

    it('keeps only the selected features, and ignores selected features of repos no longer selected', () => {
      expect(all({ featureKeys: ['key:alpha/combat', 'key:beta/ui'] })).toEqual(['alpha/combat#01', 'beta/ui#07', 'alpha/combat#02'])
      expect(all({ repoGroupKeys: ['key:beta'], featureKeys: ['key:alpha/combat'] })).toEqual(['beta/combat#01', 'beta/ui#07'])
    })

    it('searches number, title and status note, ignoring case', () => {
      expect(all({ search: 'SWORD' })).toEqual(['alpha/combat#01'])
      expect(all({ search: 'art' })).toEqual(['alpha/combat#02'])
      expect(all({ search: '07' })).toEqual(['beta/ui#07'])
      expect(all({ search: '  ' })).toHaveLength(5)
    })

    it('offers the features of the selected repos for the feature filter', () => {
      expect(featureOptions(model, ['key:beta']).map((o) => o.key)).toEqual(['key:beta/combat', 'key:beta/ui'])
      expect(featureOptions(model, []).map((o) => o.key)).toEqual(['key:alpha/combat', 'key:alpha/ideas', 'key:beta/combat', 'key:beta/ui'])
    })
  })

  describe('group by', () => {
    const model: BoardModel = {
      repoGroups: [
        repo('beta', [feature('ui', [ticket('07', 'backlog')])]),
        repo('alpha', [
          feature('mining', [ticket('01', 'done'), ticket('02', 'in-progress'), ticket('03', 'backlog')]),
          feature('caves', [ticket('01', 'blocked')]),
          feature('old', [ticket('01', 'done')])
        ])
      ]
    }
    const headers = (layout: BoardLayout) => layout.lanes.map((l) => l.header)

    it('is one headerless lane when not grouped', () => {
      expect(headers(layoutBoard(model, view()))).toEqual([null])
    })

    it('makes one lane per feature with its progress, leaving out lanes with nothing to show', () => {
      const layout = layoutBoard(model, view({ groupBy: 'feature' }))
      expect(headers(layout)).toEqual([
        { repoGroupKey: 'key:alpha', repoName: 'alpha', featureName: 'caves', progress: { done: 0, total: 1, lastNote: 'caves note' } },
        { repoGroupKey: 'key:alpha', repoName: 'alpha', featureName: 'mining', progress: { done: 1, total: 3, lastNote: 'mining note' } },
        { repoGroupKey: 'key:beta', repoName: 'beta', featureName: 'ui', progress: { done: 0, total: 1, lastNote: 'ui note' } }
      ])
      expect(columnsOf(layout, 1)).toEqual({ backlog: ['alpha/mining#03'], blocked: [], 'in-progress': ['alpha/mining#02'], done: ['alpha/mining#01'] })
      expect(layoutBoard(model, view({ groupBy: 'feature', showFinished: true })).lanes.map((l) => l.header?.featureName)).toEqual([
        'caves',
        'mining',
        'old',
        'ui'
      ])
    })

    it('makes one lane per repo with the progress of all its features', () => {
      const layout = layoutBoard(model, view({ groupBy: 'repo' }))
      expect(headers(layout)).toEqual([
        { repoGroupKey: 'key:alpha', repoName: 'alpha', featureName: null, progress: { done: 2, total: 5, lastNote: null } },
        { repoGroupKey: 'key:beta', repoName: 'beta', featureName: null, progress: { done: 0, total: 1, lastNote: null } }
      ])
      expect(layout.lanes[0].columns.find((c) => c.column === 'done')?.finished).toEqual({ cards: 1, features: 1 })
    })
  })

  describe('by account', () => {
    const personal: Account = { profileId: 'p', name: 'Personal', plan: 'Max', label: 'Personal · Max', email: null }
    const work: Account = { profileId: 'w', name: 'Work', plan: 'Team', label: 'Work · Team', email: null }
    const model: BoardModel = {
      repoGroups: [
        repo('alpha', [feature('mining', [ticket('01', 'backlog')])]),
        repo('beta', [feature('crafting', [ticket('02', 'backlog')])]),
        repo('gamma', [feature('pvp', [ticket('03', 'in-progress')])])
      ]
    }
    const accounts = {
      order: [personal, work],
      byRepo: { 'key:alpha': work, 'key:beta': personal, 'key:gamma': work },
      repoOrder: ['key:gamma', 'key:beta', 'key:alpha']
    }

    it("makes one lane per account, in Settings order, each holding its repos' tickets in saved workspace order", () => {
      const layout = layoutBoard(model, view({ groupBy: 'account', accounts }))
      expect(layout.lanes.map((l) => [l.key, l.header?.account?.label])).toEqual([
        ['account:p', 'Personal · Max'],
        ['account:w', 'Work · Team']
      ])
      expect(columnsOf(layout, 0).backlog).toEqual(['beta/crafting#02'])
      expect(columnsOf(layout, 1)).toMatchObject({ backlog: ['alpha/mining#01'], 'in-progress': ['gamma/pvp#03'] })
      expect(layout.lanes[1].header?.progress).toEqual({ done: 0, total: 2, lastNote: null })
    })

    it('puts a repo no workspace claims under the first account', () => {
      const layout = layoutBoard(model, view({ groupBy: 'account', accounts: { ...accounts, byRepo: { 'key:alpha': work } } }))
      expect(layout.lanes.map((l) => l.key)).toEqual(['account:p', 'account:w'])
      expect(columnsOf(layout, 0).backlog).toEqual(['beta/crafting#02'])
    })
  })

  describe('up/down neighbours', () => {
    const model: BoardModel = {
      repoGroups: [
        repo('alpha', [feature('ideas', []), feature('mining', [ticket('01', 'backlog'), ticket('02', 'backlog'), ticket('03', 'done')])]),
        repo('beta', [feature('ui', [ticket('07', 'backlog')])])
      ]
    }
    const ref = (repoName: string, featureName: string, number: string) => {
      const t = model.repoGroups.find((g) => g.repoName === repoName)?.features.find((f) => f.name === featureName)?.tickets.find((x) => x.number === number)
      return { repoGroupKey: `key:${repoName}`, featureName, fileName: t?.fileName ?? '' }
    }

    it('steps to the previous or next ticket card in the same column, skipping spec-only cards', () => {
      const layout = layoutBoard(model, view())
      expect(neighbourCard(layout, ref('alpha', 'mining', '02'), 'down')).toEqual(ref('beta', 'ui', '07'))
      expect(neighbourCard(layout, ref('alpha', 'mining', '02'), 'up')).toEqual(ref('alpha', 'mining', '01'))
      expect(neighbourCard(layout, ref('alpha', 'mining', '01'), 'up')).toBeNull()
      expect(neighbourCard(layout, ref('alpha', 'mining', '03'), 'down')).toBeNull()
    })

    it('stays inside the swimlane and gives null for a card that is not shown', () => {
      const layout = layoutBoard(model, view({ groupBy: 'repo' }))
      expect(neighbourCard(layout, ref('alpha', 'mining', '02'), 'down')).toBeNull()
      const filtered = layoutBoard(model, view({ filter: { ...DEFAULTS.filter, repoGroupKeys: ['key:beta'] } }))
      expect(neighbourCard(filtered, ref('alpha', 'mining', '01'), 'down')).toBeNull()
    })
  })

  describe('not added repos', () => {
    const found = (repoName: string, mainAdded: boolean, worktrees: number): DiscoveredRepo => ({
      repoGroupKey: `key:${repoName}`,
      repoName,
      main: mainAdded ? null : { path: `C:/${repoName}`, worktreeTag: '', featureCount: 1, openTicketCount: 1 },
      mainAdded,
      worktrees: Array.from({ length: worktrees }, (_, i) => ({ path: `C:/${repoName}-wt-${i}`, worktreeTag: `wt-${i}`, featureCount: 1, openTicketCount: 1 })),
      featureCount: 1,
      openTicketCount: 1
    })
    const repos = [found('FantasySurvival', true, 31), found('alpha', false, 0), found('beta', false, 2)]

    it('leaves out repos whose main checkout is added, and their worktrees, unless worktrees are shown', () => {
      expect(notAddedRepos(repos, false).map((r) => [r.repoName, r.worktrees.length])).toEqual([
        ['alpha', 0],
        ['beta', 0]
      ])
      expect(notAddedRepos(repos, true).map((r) => [r.repoName, r.worktrees.length])).toEqual([
        ['FantasySurvival', 31],
        ['alpha', 0],
        ['beta', 2]
      ])
    })
  })

  it("lists a ticket's unresolved blockers: missing numbers, or a number with any file not done", () => {
    const blocked = ticket('05', 'blocked')
    blocked.sightings = [
      { ...blocked.sightings[0], blockedBy: ['01', '02'] },
      { ...blocked.sightings[0], workspaceId: 'wt', blockedBy: ['02', '03', '09'] }
    ]
    const twin = { ...ticket('02', 'backlog'), fileName: '02-other.md' }
    const model: BoardModel = {
      repoGroups: [repo('alpha', [feature('f', [ticket('01', 'done'), ticket('02', 'done'), twin, ticket('03', 'done'), blocked])])]
    }
    const card = layoutBoard(model, view()).lanes[0].columns.find((c) => c.column === 'blocked')?.cards[0]
    expect(card?.kind === 'ticket' && card.blockers).toEqual(['02', '09'])
  })
})
