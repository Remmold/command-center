import { describe, expect, it } from 'vitest'
import { UNGROUPED, type SidebarLayout } from '../../shared/sidebarGroups'
import type { ObservedSession, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import {
  accountChats,
  accountSections,
  listFold,
  repoFoldKey,
  seedSource,
  sessionList,
  sessionRowTooltip,
  shownRows,
  waitingBadge,
  waitingRows,
  type HostedSessionInput,
  type ListFold,
  type SessionListInput
} from './sessionList'
import { createGroup, moveChat, moveGroup, placeChats, seedLayout, setFolded } from './sidebarGroups'
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

const NO_FOLD: ListFold = { accounts: [], searching: false }
const NO_LAYOUT: SidebarLayout = { accounts: {} }

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
    { profileId: 'default', name: 'a@home.com', plan: 'Max', label: 'a@home.com · Max', email: null },
    { profileId: 'p-work', name: 'Work', plan: 'Team', label: 'Work · Team', email: null }
  ]
  const workWs = { ...workspace('wk', 'work-repo'), profileId: 'p-work' }
  const sessions: Partial<SessionListInput> = {
    workspaces: [...WORKSPACES, workWs],

    hosted: [hosted('w1', 'work waiting', 0, 'wk'), hosted('h1', 'home running', 0), hosted('h2', 'home waiting', 0), hosted('w2', 'work idle', 0, 'wk')],
    statuses: [status('w1', 'your-turn', 1), status('h1', 'running', 2), status('h2', 'needs-approval', 3)],
    observed: [observed('o', 'home vscode', 1)]
  }
  const sections = () => accountSections(sessionList(input(sessions)), ACCOUNTS, NO_LAYOUT)

  it('puts each account in its own section, in Settings order; chats not placed yet sit in Ungrouped, needs you, running, idle, In VS Code', () => {
    expect(sections().map((s) => [s.account.label, s.groups.map((g) => g.name), s.rows.map((r) => r.title)])).toEqual([
      ['a@home.com · Max', ['Ungrouped'], ['home waiting', 'home running', 'home vscode']],
      ['Work · Team', ['Ungrouped'], ['work waiting', 'work idle']]
    ])
  })

  it('sorts newest first inside each status, waiting chats longest wait first, before they are placed', () => {
    const many: Partial<SessionListInput> = {
      hosted: [hosted('i1', 'old idle', 1), hosted('i2', 'new idle', 9), hosted('r1', 'old run', 2), hosted('r2', 'new run', 8), hosted('w1', 'old wait', 3), hosted('w2', 'new wait', 7)],
      statuses: [status('r1', 'running', 2), status('r2', 'running', 8), status('w1', 'your-turn', 3), status('w2', 'needs-approval', 7)],
      observed: [observed('o1', 'old vscode', 1), observed('o2', 'new vscode', 20)]
    }
    const [only] = accountSections(sessionList(input(many)), ACCOUNTS, NO_LAYOUT)
    expect(only.rows.map((r) => r.title)).toEqual(['old wait', 'new wait', 'new run', 'old run', 'new idle', 'old idle', 'new vscode', 'old vscode'])
  })

  it("counts each account's waiting sessions for its header badge", () => {
    expect(sections().map((s) => s.needsYou)).toEqual([1, 1])
  })

  it("shows a folded section's waiting chats as N waiting, and nothing on an open one or without waiting chats", () => {
    const [home, work] = sections()
    expect(waitingBadge(work.needsYou, work.account.name, false)).toEqual({ text: '1 waiting', tooltip: '1 chat in Work is waiting on you' })
    expect(waitingBadge(work.needsYou, work.account.name, true)).toBeNull()
    expect(waitingBadge(2, home.account.name, false)).toEqual({ text: '2 waiting', tooltip: '2 chats in a@home.com are waiting on you' })
    expect(waitingBadge(0, home.account.name, false)).toBeNull()
  })

  it('leaves out accounts without sessions and puts sessions of a removed profile under the default account', () => {
    const orphan = { ...workspace('or', 'orphan'), profileId: 'gone' }
    const list = sessionList(input({ workspaces: [...WORKSPACES, orphan], hosted: [hosted('x', 'orphan one', 0, 'or')] }))
    expect(accountSections(list, ACCOUNTS, NO_LAYOUT).map((s) => [s.account.profileId, s.rows[0].title])).toEqual([['default', 'orphan one']])
    expect(accountChats(list, ACCOUNTS)).toEqual([{ profileId: 'default', chats: [{ id: 'pane:x' }] }])
  })

  it('numbers rows for Alt+1..9 in the order shown, skipping collapsed sections', () => {
    expect(shownRows(sections(), NO_FOLD).map((r) => r.title)).toEqual(['home waiting', 'home running', 'home vscode', 'work waiting', 'work idle'])
    expect(shownRows(sections(), { accounts: ['default'], searching: false }).map((r) => r.title)).toEqual(['work waiting', 'work idle'])
  })

  it('queues waiting sessions for Ctrl+Shift+J in the order shown, collapsed sections included', () => {
    const more = { ...sessions, statuses: [...sessions.statuses!, status('w2', 'your-turn', 0)] }
    const list = accountSections(sessionList(input(more)), ACCOUNTS, NO_LAYOUT)
    expect(waitingRows(list).map((r) => r.title)).toEqual(['home waiting', 'work idle', 'work waiting'])
  })
})

describe('sessionRowTooltip', () => {
  it('keeps the full title, model and effort of a hosted row, since a narrow list hides the model', () => {
    const [row] = sessionList(input({ hosted: [{ ...hosted('a', 'Repo icons for every workspace'), modelTag: 'Opus 5.5 · Medium' }], statuses: [status('a', 'your-turn', 1)] }))[0].rows
    expect(sessionRowTooltip(row)).toBe('Repo icons for every workspace · command-center · Opus 5.5 · Medium · Your turn · double-click to rename, Ctrl+click to open beside')
  })

  it('reads the same without a model tag, and marks a VS Code row read-only', () => {
    const [row] = sessionList(input({ hosted: [hosted('a', 'New session')] }))[0].rows
    expect(sessionRowTooltip(row)).toBe('New session · command-center · Idle · double-click to rename, Ctrl+click to open beside')
    const [vs] = sessionList(input({ observed: [observed('o', 'home vscode', 1)] }))[0].rows
    expect(sessionRowTooltip(vs)).toMatch(/^home vscode · .* in VS Code \(read-only\)$/)
  })
})

describe('own groups', () => {
  const ACCOUNTS: Account[] = [
    { profileId: 'default', name: 'Personal', plan: 'Ultra', label: 'Personal · Ultra', email: null },
    { profileId: 'p-work', name: 'Work', plan: 'Team', label: 'Work · Team', email: null }
  ]
  const onWork = (w: Workspace): Workspace => ({ ...w, profileId: 'p-work' })
  const WS = [
    workspace('mm', 'mmorpg', 'shard-2'),
    onWork(workspace('nk', 'nordkastell')),
    workspace('cc', 'command-center'),
    onWork(workspace('ct', 'continuum')),
    workspace('mm-main', 'mmorpg')
  ]
  const sessions: Partial<SessionListInput> = {
    workspaces: WS,
    hosted: [
      hosted('c1', 'cc idle', 5, 'cc'),
      hosted('m1', 'shard idle', 1, 'mm'),
      hosted('m2', 'main waiting', 0, 'mm-main'),
      hosted('t1', 'ct running', 0, 'ct'),
      hosted('t2', 'ct waiting', 0, 'ct'),
      { ...hosted('n1', 'nk idle', 0, 'nk'), claudeSessionId: 's-n1' }
    ],
    statuses: [status('m2', 'needs-approval', 2), status('t1', 'running', 3), status('t2', 'your-turn', 4)],
    observed: [observed('o', 'cc vscode', 9)]
  }
  const list = (over: Partial<SessionListInput> = {}) => sessionList(input({ ...sessions, ...over }))
  const seeded = (folded: string[] = []) => seedLayout(seedSource(list(), ACCOUNTS, WS, folded), 0)
  const shape = (sections: ReturnType<typeof accountSections>) =>
    sections.map((s) => [s.account.name, s.groups.map((g) => [g.name, g.rows.map((r) => r.title)])])

  it('seeds each account’s groups from its repo groups in Settings → Workspaces order, worktrees together, so nothing moves', () => {
    expect(shape(accountSections(list(), ACCOUNTS, seeded()))).toEqual([
      [
        'Personal',
        [
          ['mmorpg', ['main waiting', 'shard idle']],
          ['command-center', ['cc idle', 'cc vscode']]
        ]
      ],
      [
        'Work',
        [
          ['nordkastell', ['nk idle']],
          ['continuum', ['ct waiting', 'ct running']]
        ]
      ]
    ])
    expect(seeded().accounts['p-work'].known['pane:n1']).toEqual({ seen: 0, session: 's-n1' })
  })

  it('seeds a repo group’s fold from its fold on that account only', () => {
    const layout = seeded([repoFoldKey('default', 'key-mmorpg'), repoFoldKey('p-work', 'key-command-center')])
    const [home, work] = accountSections(list(), ACCOUNTS, layout)
    expect(home.groups.map((g) => g.folded)).toEqual([true, false])
    expect(work.groups.map((g) => g.folded)).toEqual([false, false])
  })

  it('keeps a waiting chat where it was put instead of jumping to the top', () => {
    const layout = moveChat(seeded(), 'default', 'pane:m2', { group: 'repo:key-mmorpg', before: null })
    const [home] = accountSections(list(), ACCOUNTS, layout)
    expect(home.groups[0].rows.map((r) => r.title)).toEqual(['shard idle', 'main waiting'])
    expect(waitingRows(accountSections(list(), ACCOUNTS, layout)).map((r) => r.title)).toEqual(['main waiting', 'ct waiting'])
  })

  it('shows a new chat at the top of Ungrouped, which is last, and hides Ungrouped when empty', () => {
    const more = list({ hosted: [...sessions.hosted!, hosted('new', 'brand new', 0, 'cc')] })
    const layout = placeChats(seeded(), accountChats(more, ACCOUNTS), 0)
    const [home] = accountSections(more, ACCOUNTS, layout)
    expect(home.groups.map((g) => g.name)).toEqual(['mmorpg', 'command-center', 'Ungrouped'])
    expect(home.groups[2].rows.map((r) => r.title)).toEqual(['brand new'])
    expect(home.rows.at(-1)?.title).toBe('brand new')
    expect(accountSections(list(), ACCOUNTS, seeded())[0].groups.map((g) => g.id)).not.toContain(UNGROUPED)
  })

  it('shows Ungrouped where it was moved, a new chat at its top', () => {
    const moved = moveGroup(seeded(), 'default', UNGROUPED, 'repo:key-command-center')
    const withOld = placeChats(moved, accountChats(list({ hosted: [...sessions.hosted!, hosted('old', 'older', 0, 'cc')] }), ACCOUNTS), 0)
    const more = list({ hosted: [...sessions.hosted!, hosted('old', 'older', 0, 'cc'), hosted('new', 'brand new', 0, 'cc')] })
    const [home] = accountSections(more, ACCOUNTS, placeChats(withOld, accountChats(more, ACCOUNTS), 0))
    expect(home.groups.map((g) => [g.name, g.rows.map((r) => r.title)])).toEqual([
      ['mmorpg', ['main waiting', 'shard idle']],
      ['Ungrouped', ['brand new', 'older']],
      ['command-center', ['cc idle', 'cc vscode']]
    ])
    const unplaced = accountSections(more, ACCOUNTS, withOld)[0]
    expect(unplaced.groups[1].rows.map((r) => r.title)).toEqual(['brand new', 'older'])
  })

  it('shows an empty own group so a chat can be dropped in, but hides it during a search; matches stay under their group', () => {
    const layout = createGroup(seeded(), 'default', { id: 'later', name: 'Later' })
    expect(accountSections(list(), ACCOUNTS, layout)[0].groups.map((g) => g.name)).toEqual(['mmorpg', 'command-center', 'Later'])
    const found = accountSections(list({ search: 'idle' }), ACCOUNTS, layout, true)
    expect(shape(found)).toEqual([
      [
        'Personal',
        [
          ['mmorpg', ['shard idle']],
          ['command-center', ['cc idle']]
        ]
      ],
      ['Work', [['nordkastell', ['nk idle']]]]
    ])
  })

  const titles = (layout: ReturnType<typeof seeded>, fold: ListFold) => shownRows(accountSections(list(), ACCOUNTS, layout), fold).map((r) => r.title)

  it('numbers only visible rows for Alt+1..9: folded groups and folded accounts show none, a search opens every group', () => {
    const layout = setFolded(setFolded(seeded(), 'default', 'repo:key-mmorpg', true), 'p-work', 'repo:key-continuum', true)
    expect(titles(layout, NO_FOLD)).toEqual(['cc idle', 'cc vscode', 'nk idle'])
    expect(titles(layout, { accounts: ['p-work'], searching: false })).toEqual(['cc idle', 'cc vscode'])
    expect(titles(layout, { accounts: [], searching: true })).toHaveLength(7)
  })

  it('counts waiting chats per group for its folded pill', () => {
    const [home, work] = accountSections(list(), ACCOUNTS, seeded())
    expect(home.groups.map((g) => g.needsYou)).toEqual([1, 0])
    expect(work.groups.map((g) => g.needsYou)).toEqual([0, 1])
    expect(waitingBadge(home.groups[0].needsYou, home.groups[0].name, false)).toEqual({ text: '1 waiting', tooltip: '1 chat in mmorpg is waiting on you' })
  })

  it('ignores account folds without account headers, and opens every group while searching', () => {
    expect(listFold(['p-work'], { search: '', headed: true })).toEqual({ accounts: ['p-work'], searching: false })
    expect(listFold(['p-work'], { search: ' shard ', headed: true })).toEqual({ accounts: ['p-work'], searching: true })
    expect(listFold(['p-work'], { search: '', headed: false })).toEqual({ accounts: [], searching: false })
  })
})
