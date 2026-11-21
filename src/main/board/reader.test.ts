import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { BoardModel, BoardTicket, Workspace } from '../../shared/types'
import { readBoard } from './reader'
import { nodeFileReader } from './nodeFileReader'

const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'board-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

function workspace(path: string, over: Partial<Workspace> = {}): Workspace {
  return {
    id: over.id ?? path,
    name: 'ws',
    path,
    createdAt: 0,
    profileId: 'default',
    repoGroupKey: over.repoGroupKey ?? `dir:${path}`,
    repoName: over.repoName ?? 'repo',
    worktreeTag: '',
    ...over
  }
}

function ticket(title: string, lines: string[]): string {
  return [`# ${title}`, '', '**What to build:** something', '', ...lines, '', '- [ ] a box'].join('\n')
}

function tickets(model: BoardModel): BoardTicket[] {
  return model.repoGroups.flatMap((g) => g.features.flatMap((f) => f.tickets))
}

function columns(model: BoardModel): Record<string, string> {
  return Object.fromEntries(tickets(model).map((t) => [t.number, t.column]))
}

describe('board reader', () => {
  it('puts a ticket with a bold resolved Status in Done', async () => {
    const root = fixture({
      '.scratch/progression-flow/spec.md': '# spec',
      '.scratch/progression-flow/issues/01-progression-module.md': ticket(
        '01: Progression module',
        ['**Blocked by:** None (can start immediately)', '', '**Status:** resolved']
      )
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(model.repoGroups).toHaveLength(1)
    const [feature] = model.repoGroups[0].features
    expect(feature.name).toBe('progression-flow')
    expect(feature.tickets).toHaveLength(1)
    expect(feature.tickets[0]).toMatchObject({
      number: '01',
      title: 'Progression module',
      column: 'done',
      status: 'resolved'
    })
  })

  it('reads plain and bold Status lines alike, and a missing Status as Backlog', async () => {
    const root = fixture({
      '.scratch/villager-talk/issues/01-plain.md': '# 01: Plain\n\nStatus: needs-triage\n',
      '.scratch/villager-talk/issues/02-bold-wontfix.md': ticket('02: Bold', ['**Status:** wontfix']),
      '.scratch/villager-talk/issues/03-missing.md': ticket('03: Missing', []),
      '.scratch/villager-talk/issues/04-plain-resolved.md': '# 04: Resolved\r\n\r\nstatus:   Resolved\r\n'
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(columns(model)).toEqual({ '01': 'backlog', '02': 'done', '03': 'backlog', '04': 'done' })
    expect(tickets(model).map((t) => t.status)).toEqual(['needs-triage', 'wontfix', null, 'resolved'])
  })

  it('puts a ticket in Blocked when any listed blocker is not resolved, and treats None as no blockers', async () => {
    const root = fixture({
      '.scratch/equipment/issues/01-done.md': ticket('01: Done', ['**Status:** resolved']),
      '.scratch/equipment/issues/02-open.md': ticket('02: Open', ['**Status:** ready-for-agent']),
      '.scratch/equipment/issues/03-none.md': ticket('03: None', [
        '**Blocked by:** None (can start immediately)',
        '**Status:** ready-for-agent'
      ]),
      '.scratch/equipment/issues/04-one-open.md': ticket('04: One open', [
        '**Blocked by:** 01, 02',
        '**Status:** ready-for-agent'
      ]),
      '.scratch/equipment/issues/05-all-done.md': ticket('05: All done', [
        'Blocked by: 01',
        'Status: ready-for-agent'
      ]),
      '.scratch/equipment/issues/06-prose.md': ticket('06: Prose', [
        "**Blocked by:** animation round 2's hero group (control feel, 12b swing feel) on main",
        '**Status:** ready-for-agent'
      ])
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(columns(model)).toMatchObject({ '03': 'backlog', '04': 'blocked', '05': 'backlog', '06': 'backlog' })
    const blockedBy = Object.fromEntries(tickets(model).map((t) => [t.number, t.sightings[0].blockedBy]))
    expect(blockedBy).toMatchObject({ '03': [], '04': ['01', '02'], '05': ['01'], '06': [] })
  })

  it('reads blocker numbers from ; lists and stops at the first item that names another feature', async () => {
    const root = fixture({
      '.scratch/realm/issues/04-open.md': ticket('04: Open', ['Status: ready-for-agent']),
      '.scratch/realm/issues/07-done.md': ticket('07: Done', ['Status: resolved']),
      '.scratch/realm/issues/08-groups.md': ticket('08: Groups', [
        '**Blocked by:** 07 for group 1; 07 and 07 for group 2',
        '**Status:** ready-for-agent'
      ]),
      '.scratch/realm/issues/09-cross.md': ticket('09: Cross', [
        '**Blocked by:** 07; villager-talk group 1 (its tickets 04 and 05)',
        '**Status:** ready_for_agent'
      ])
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    const byNumber = Object.fromEntries(tickets(model).map((t) => [t.number, t]))
    expect(byNumber['08'].sightings[0].blockedBy).toEqual(['07', '07', '07'])
    expect(byNumber['09'].sightings[0].blockedBy).toEqual(['07'])
    expect(byNumber['09'].status).toBe('ready_for_agent')
    expect(columns(model)).toMatchObject({ '08': 'backlog', '09': 'backlog' })
  })

  it('counts a blocker resolved in any worktree copy as resolved', async () => {
    const feature = '.scratch/combat/issues/'
    const main = fixture({
      [feature + '01-swing.md']: ticket('01: Swing', ['**Status:** ready-for-agent']),
      [feature + '02-dodge.md']: ticket('02: Dodge', ['**Blocked by:** 01', '**Status:** ready-for-agent'])
    })
    const shard = fixture({
      [feature + '01-swing.md']: ticket('01: Swing', ['**Status:** resolved']),
      [feature + '02-dodge.md']: ticket('02: Dodge', ['**Blocked by:** 01', '**Status:** ready-for-agent'])
    })
    const key = 'git:c:/projects/fs/.git'
    const model = await readBoard(
      [
        workspace(main, { id: 'main', repoGroupKey: key }),
        workspace(shard, { id: 'shard', repoGroupKey: key, worktreeTag: 'shard' })
      ],
      nodeFileReader
    )
    expect(columns(model)).toEqual({ '01': 'done', '02': 'backlog' })
  })

  it('reads a letter suffix as part of the ticket number, in blockers and progress files too', async () => {
    const issues = '.scratch/equipment/issues/'
    const root = fixture({
      [issues + '03-next.md']: ticket('03: Next', ['**Status:** ready-for-agent']),
      [issues + '02b-no-regressions.md']: ticket('02b: No regressions', ['**Status:** ready-for-agent']),
      [issues + '02b-no-regressions.progress.md']: 'Done: half.',
      [issues + '02-base.md']: ticket('02: Base', ['**Status:** resolved']),
      [issues + '12b-swing-feel.md']: ticket('12b: Swing feel', ['**Status:** resolved']),
      [issues + '13-after-b.md']: ticket('13: After 02b', ['**Blocked by:** 02, 02b', '**Status:** ready-for-agent']),
      [issues + '14-after-12b.md']: ticket('14: After 12b', ['**Blocked by:** 12b', '**Status:** ready-for-agent'])
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    const all = tickets(model)
    expect(all.map((t) => t.number)).toEqual(['02', '02b', '03', '12b', '13', '14'])
    expect(all[1]).toMatchObject({ title: 'No regressions', column: 'in-progress' })
    expect(all[1].sightings[0].progressPath).toBe(join(root, issues, '02b-no-regressions.progress.md'))
    expect(all[4].sightings[0].blockedBy).toEqual(['02', '02b'])
    expect(columns(model)).toMatchObject({ '13': 'blocked', '14': 'backlog' })
  })

  it('puts a ticket whose Status starts with blocked in Blocked', async () => {
    const root = fixture({
      '.scratch/art/issues/01-art.md': ticket('01: Art', ['**Status:** blocked — waiting on art']),
      '.scratch/art/issues/02-plain.md': ticket('02: Plain', ['Status: Blocked']),
      '.scratch/art/issues/03-noted.md': ticket('03: Noted', ['Status: blocked']),
      '.scratch/art/issues/03-noted.progress.md': 'Done: started.'
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(columns(model)).toEqual({ '01': 'blocked', '02': 'blocked', '03': 'blocked' })
    expect(tickets(model)[0].status).toBe('blocked')
  })

  it('puts a claimed ticket, or one with its own progress file, in In progress', async () => {
    const root = fixture({
      '.scratch/workspace-hub/issues/01-claimed.md': ticket('01: Claimed', ['Status: claimed']),
      '.scratch/workspace-hub/issues/02-noted.md': ticket('02: Noted', ['**Status:** ready-for-agent']),
      '.scratch/workspace-hub/issues/02-noted.progress.md': 'Done: half.\nNext: rest.\nOpen reds: none.',
      '.scratch/workspace-hub/issues/03-noted-blocked.md': ticket('03: Noted but blocked', [
        '**Blocked by:** 04',
        '**Status:** ready-for-agent'
      ]),
      '.scratch/workspace-hub/issues/03-noted-blocked.progress.md': 'Done: started.',
      '.scratch/workspace-hub/issues/04-plain.md': ticket('04: Plain', ['**Status:** ready-for-agent'])
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(columns(model)).toEqual({ '01': 'in-progress', '02': 'in-progress', '03': 'blocked', '04': 'backlog' })
    const noted = tickets(model).find((t) => t.number === '02')
    expect(noted?.sightings[0].progressPath).toBe(
      join(root, '.scratch/workspace-hub/issues/02-noted.progress.md')
    )
  })

  it('merges worktree copies of one ticket into one card with the highest column', async () => {
    const feature = '.scratch/combat/issues/'
    const main = fixture({
      [feature + '01-swing.md']: ticket('01: Swing', ['**Status:** ready-for-agent']),
      [feature + '02-block.md']: ticket('02: Block', ['**Status:** resolved']),
      [feature + '03-dodge.md']: ticket('03: Dodge', ['**Blocked by:** 01', '**Status:** ready-for-agent'])
    })
    const shard = fixture({
      [feature + '01-swing.md']: ticket('01: Swing', ['**Status:** claimed']),
      [feature + '02-block.md']: ticket('02: Block', ['**Status:** ready-for-agent']),
      [feature + '03-dodge.md']: ticket('03: Dodge', ['**Blocked by:** 01', '**Status:** ready-for-agent']),
      [feature + '04-parry.md']: ticket('04: Parry', ['**Status:** needs-triage'])
    })
    const other = fixture({
      [feature + '01-swing.md']: ticket('01: Other repo swing', ['**Status:** needs-triage'])
    })
    const key = 'git:c:/projects/fs/.git'
    const model = await readBoard(
      [
        workspace(main, { id: 'main', repoGroupKey: key, repoName: 'FantasySurvival' }),
        workspace(shard, { id: 'shard-2', repoGroupKey: key, repoName: 'FantasySurvival', worktreeTag: 'shard-2' }),
        workspace(other, { id: 'other', repoName: 'Agon' })
      ],
      nodeFileReader
    )

    expect(model.repoGroups.map((g) => g.repoName)).toEqual(['Agon', 'FantasySurvival'])
    const fs = model.repoGroups[1]
    expect(fs.features).toHaveLength(1)
    expect(fs.features[0].sightings.map((s) => s.workspaceId)).toEqual(['main', 'shard-2'])

    const cards = fs.features[0].tickets
    expect(cards.map((t) => [t.number, t.column, t.status])).toEqual([
      ['01', 'in-progress', 'claimed'],
      ['02', 'done', 'resolved'],
      ['03', 'blocked', 'ready-for-agent'],
      ['04', 'backlog', 'needs-triage']
    ])
    expect(cards[0].sightings.map((s) => [s.workspaceId, s.column])).toEqual([
      ['shard-2', 'in-progress'],
      ['main', 'backlog']
    ])
    expect(cards[1].sightings.map((s) => s.workspaceId)).toEqual(['main', 'shard-2'])
    expect(cards[1].sightings[0].filePath).toBe(join(main, feature, '02-block.md'))
    expect(cards[3].sightings.map((s) => s.workspaceId)).toEqual(['shard-2'])

    expect(tickets({ repoGroups: [model.repoGroups[0]] })).toMatchObject([
      { number: '01', column: 'backlog', title: 'Other repo swing' }
    ])
  })

  it('ignores files that are not tickets and records each feature copy’s spec and notes', async () => {
    const root = fixture({
      '.scratch/test-flow-parked-run-R.md': '**Status:** resolved',
      '.scratch/controls-options/spec.md': '# spec',
      '.scratch/controls-options/progress.md': '- 01 resolved',
      '.scratch/controls-options/night-notes.md': 'Status: claimed',
      '.scratch/controls-options/latency-after-04.json': '{}',
      '.scratch/controls-options/issues/01-remap.md': ticket('01: Remap', ['Status: needs-triage']),
      '.scratch/controls-options/issues/README.md': 'Status: claimed',
      '.scratch/controls-options/issues/01-remap.txt': 'Status: claimed',
      '.scratch/controls-options/issues/old/02-nested.md': 'Status: claimed',
      '.scratch/controls-options/issues/03-orphan.progress.md': 'Done: nothing.',
      '.scratch/camera-feel/night-notes.md': 'notes only'
    })
    const model = await readBoard([workspace(root, { id: 'w' })], nodeFileReader)
    const features = model.repoGroups[0].features
    expect(features.map((f) => f.name)).toEqual(['camera-feel', 'controls-options'])
    expect(features[0].tickets).toEqual([])
    expect(features[0].sightings).toEqual([{ workspaceId: 'w', specPath: null, progressPath: null, lastActivity: null }])
    expect(features[1].tickets.map((t) => [t.number, t.column])).toEqual([['01', 'backlog']])
    expect(features[1].sightings).toEqual([
      {
        workspaceId: 'w',
        specPath: join(root, '.scratch/controls-options/spec.md'),
        progressPath: join(root, '.scratch/controls-options/progress.md'),
        lastActivity: expect.any(Number)
      }
    ])
  })

  it('keeps two different ticket files sharing a number as two cards, and merges copies by file name', async () => {
    const issues = '.scratch/animation-round2/issues/'
    const main = fixture({
      [issues + '09-hero-idle.md']: ticket('09: Hero idle', ['**Status:** resolved']),
      [issues + '09-enemy-walk.md']: ticket('09: Enemy walk', ['**Status:** ready-for-agent']),
      [issues + '10-after.md']: ticket('10: After', ['**Blocked by:** 09', '**Status:** ready-for-agent'])
    })
    const shard = fixture({
      [issues + '09-Hero-Idle.md']: ticket('09: Hero idle', ['**Status:** claimed']),
      [issues + '09-enemy-walk.md']: ticket('09: Enemy walk', ['**Status:** claimed'])
    })
    const key = 'git:c:/projects/fs/.git'
    const model = await readBoard(
      [
        workspace(main, { id: 'main', repoGroupKey: key }),
        workspace(shard, { id: 'shard', repoGroupKey: key, worktreeTag: 'shard' })
      ],
      nodeFileReader
    )
    const cards = tickets(model)
    expect(cards.map((t) => [t.number, t.fileName, t.column, t.sightings.map((s) => s.workspaceId)])).toEqual([
      ['09', '09-enemy-walk.md', 'in-progress', ['shard', 'main']],
      ['09', '09-hero-idle.md', 'done', ['main', 'shard']],
      ['10', '10-after.md', 'blocked', ['main']]
    ])
  })

  it('reports a feature’s progress as done out of total plus the last non-empty line of its notes', async () => {
    const root = fixture({
      '.scratch/combat/spec.md': '# spec',
      '.scratch/combat/progress.md': '- 01 resolved: swing\r\n- 02 claimed: dodge, half done\r\n\r\n   \r\n',
      '.scratch/combat/issues/01-swing.md': ticket('01: Swing', ['**Status:** resolved']),
      '.scratch/combat/issues/02-dodge.md': ticket('02: Dodge', ['**Status:** claimed']),
      '.scratch/combat/issues/03-parry.md': ticket('03: Parry', ['**Status:** wontfix']),
      '.scratch/combat/issues/04-feint.md': ticket('04: Feint', [])
    })
    const [feature] = (await readBoard([workspace(root)], nodeFileReader)).repoGroups[0].features
    expect(feature.state).toBe('active')
    expect(feature.progress).toEqual({ done: 2, total: 4, lastNote: '- 02 claimed: dodge, half done' })
  })

  it('marks a feature whose tickets are all done as finished', async () => {
    const root = fixture({
      '.scratch/old-flow/spec.md': '# spec',
      '.scratch/old-flow/issues/01-a.md': ticket('01: A', ['**Status:** resolved']),
      '.scratch/old-flow/issues/02-b.md': ticket('02: B', ['Status: wontfix'])
    })
    const [feature] = (await readBoard([workspace(root)], nodeFileReader)).repoGroups[0].features
    expect(feature.state).toBe('finished')
    expect(feature.progress).toEqual({ done: 2, total: 2, lastNote: null })
  })

  it('marks a feature with a spec and no tickets as spec only, and one with neither as empty', async () => {
    const root = fixture({
      '.scratch/new-idea/spec.md': '# spec',
      '.scratch/new-idea/issues/README.md': 'not a ticket',
      '.scratch/scraps/night-notes.md': 'notes only'
    })
    const features = (await readBoard([workspace(root)], nodeFileReader)).repoGroups[0].features
    expect(features.map((f) => [f.name, f.state, f.progress.total])).toEqual([
      ['new-idea', 'spec-only', 0],
      ['scraps', 'empty', 0]
    ])
  })

  it('takes the longest worktree copy of progress.md for the last note', async () => {
    const dir = '.scratch/combat/'
    const main = fixture({
      [dir + 'progress.md']: '- 01 resolved',
      [dir + 'issues/01-swing.md']: ticket('01: Swing', ['**Status:** resolved']),
      [dir + 'issues/02-dodge.md']: ticket('02: Dodge', ['**Status:** ready-for-agent'])
    })
    const shard = fixture({
      [dir + 'progress.md']: '- 01 resolved\n- 02 resolved in the shard',
      [dir + 'issues/02-dodge.md']: ticket('02: Dodge', ['**Status:** resolved'])
    })
    const key = 'git:c:/projects/fs/.git'
    const model = await readBoard(
      [workspace(main, { id: 'main', repoGroupKey: key }), workspace(shard, { id: 'shard', repoGroupKey: key })],
      nodeFileReader
    )
    const [feature] = model.repoGroups[0].features
    expect(feature.progress).toEqual({ done: 2, total: 2, lastNote: '- 02 resolved in the shard' })
    expect(feature.state).toBe('finished')
  })

  it('records each feature copy’s newest file change and the feature’s newest across worktree copies', async () => {
    const dir = '.scratch/combat/'
    const main = fixture({
      [dir + 'spec.md']: '# spec',
      [dir + 'progress.md']: '- notes',
      [dir + 'issues/01-swing.md']: ticket('01: Swing', ['**Status:** resolved']),
      [dir + 'issues/notes.txt']: 'not a ticket'
    })
    const shard = fixture({
      [dir + 'spec.md']: '# spec',
      [dir + 'issues/01-swing.md']: ticket('01: Swing', ['**Status:** in-progress']),
      [dir + 'issues/01-swing.progress.md']: 'working'
    })
    const at = (root: string, rel: string, ms: number): void => utimesSync(join(root, rel), ms / 1000, ms / 1000)
    at(main, dir + 'spec.md', 1_000_000)
    at(main, dir + 'progress.md', 3_000_000)
    at(main, dir + 'issues/01-swing.md', 2_000_000)
    at(main, dir + 'issues/notes.txt', 9_000_000)
    at(shard, dir + 'spec.md', 1_000_000)
    at(shard, dir + 'issues/01-swing.md', 4_000_000)
    at(shard, dir + 'issues/01-swing.progress.md', 5_000_000)
    const key = 'git:c:/projects/fs/.git'
    const model = await readBoard(
      [workspace(main, { id: 'main', repoGroupKey: key }), workspace(shard, { id: 'shard', repoGroupKey: key })],
      nodeFileReader
    )
    const [feature] = model.repoGroups[0].features
    expect(feature.sightings.map((s) => [s.workspaceId, s.lastActivity])).toEqual([
      ['main', 3_000_000],
      ['shard', 5_000_000]
    ])
    expect(feature.lastActivity).toBe(5_000_000)
  })

  it('gives a feature folder with no feature files no activity time', async () => {
    const root = fixture({ '.scratch/loose/readme.txt': 'hi' })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(model.repoGroups[0].features[0]).toMatchObject({ lastActivity: null, sightings: [{ lastActivity: null }] })
  })

  it('returns no features for a workspace without a .scratch folder', async () => {
    const root = fixture({ 'README.md': '# hi' })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(model.repoGroups).toMatchObject([{ features: [] }])
  })
})

describe('board reader: ticket lifecycle words', () => {
  async function readOne(statusLine: string): Promise<BoardTicket> {
    const root = fixture({ '.scratch/f/issues/01-one.md': ticket('01: One', [statusLine]) })
    return tickets(await readBoard([workspace(root)], nodeFileReader))[0]
  }

  it.each([
    ['needs-triage', 'backlog'],
    ['needs-info', 'backlog'],
    ['ready-for-agent', 'backlog'],
    ['ready-for-human', 'backlog'],
    ['in-progress', 'in-progress'],
    ['blocked', 'blocked'],
    ['resolved', 'done'],
    ['wontfix', 'done']
  ])('maps the canonical word %s to %s with no unknown badge', async (word, column) => {
    const t = await readOne(`**Status:** ${word}`)
    expect(t).toMatchObject({ column, status: word, statusNote: null, statusKnown: true })
  })

  it.each([
    ['done', 'done'],
    ['complete', 'done'],
    ['Completed', 'done'],
    ['closed', 'done'],
    ['claimed', 'in-progress'],
    ['doing', 'in-progress'],
    ['WIP', 'in-progress']
  ])('maps the legacy word %s to %s', async (word, column) => {
    const t = await readOne(`Status: ${word}`)
    expect(t).toMatchObject({ column, status: word.toLowerCase(), statusKnown: true })
  })

  it('puts an unknown word in Backlog, flagged with the raw status line', async () => {
    const line = 'talking hint resolved (2026-11-20); the axes hint is not built'
    const t = await readOne(`**Status:** ${line}`)
    expect(t).toMatchObject({ column: 'backlog', status: 'talking', statusKnown: false, statusLine: line })
  })

  it('reads the text after an em dash as the status note', async () => {
    expect(await readOne('**Status:** blocked — waiting on art')).toMatchObject({
      column: 'blocked',
      status: 'blocked',
      statusNote: 'waiting on art'
    })
    expect(await readOne('**Status:** in-progress—groups 1 and 2 done')).toMatchObject({
      column: 'in-progress',
      status: 'in-progress',
      statusNote: 'groups 1 and 2 done'
    })
  })

  it('reads free text after the word as the note', async () => {
    expect(await readOne('**Status:** resolved for groups 1 and 2 (2026-11-20)')).toMatchObject({
      column: 'done',
      status: 'resolved',
      statusNote: 'for groups 1 and 2 (2026-11-20)',
      statusKnown: true
    })
  })

  it('treats a legacy done word as resolved for blockers, and keeps Blocked by and progress files ahead of the word', async () => {
    const root = fixture({
      '.scratch/f/issues/01-old.md': ticket('01: Old', ['**Status:** done']),
      '.scratch/f/issues/02-open.md': ticket('02: Open', ['**Status:** ready-for-agent']),
      '.scratch/f/issues/03-after-old.md': ticket('03: After old', ['**Blocked by:** 01', '**Status:** ready-for-agent']),
      '.scratch/f/issues/04-after-open.md': ticket('04: After open', ['**Blocked by:** 02', '**Status:** in-progress']),
      '.scratch/f/issues/05-noted.md': ticket('05: Noted', ['**Status:** ready-for-human']),
      '.scratch/f/issues/05-noted.progress.md': 'Done: half.'
    })
    const model = await readBoard([workspace(root)], nodeFileReader)
    expect(columns(model)).toEqual({
      '01': 'done',
      '02': 'backlog',
      '03': 'backlog',
      '04': 'blocked',
      '05': 'in-progress'
    })
  })

  it('shows no badge and no note for a missing status', async () => {
    expect(await readOne('')).toMatchObject({
      column: 'backlog',
      status: null,
      statusNote: null,
      statusLine: null,
      statusKnown: true
    })
  })
})
