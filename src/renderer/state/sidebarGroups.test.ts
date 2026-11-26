import { describe, expect, it } from 'vitest'
import { parseSidebarLayout, UNGROUPED, type AccountLayout, type SidebarLayout } from '../../shared/sidebarGroups'
import {
  createGroup,
  deleteGroup,
  groupOf,
  moveChat,
  moveChatStep,
  moveChatToNextGroup,
  moveGroup,
  moveGroupBeside,
  placeChats,
  PRUNE_AFTER_DAYS,
  renameGroup,
  seedLayout,
  setFolded
} from './sidebarGroups'

const TODAY = 1000

let n = 0
const id = () => `g${++n}`

/** Each group as `name: chats`, top to bottom, Ungrouped before the group at `ungroupedAt`. */
function shape(layout: SidebarLayout, profileId = 'home'): string[] {
  const a: AccountLayout = layout.accounts[profileId]
  const lines = a.groups.map((g) => `${g.name}${g.folded ? ' (folded)' : ''}: ${g.chats.join(' ')}`)
  lines.splice(a.ungroupedAt, 0, `${UNGROUPED}: ${a.ungrouped.join(' ')}`)
  return lines
}

describe('seeding from repo groups', () => {
  it('gives each account its repo groups as own groups, same names, order, members and folds, Ungrouped empty and last', () => {
    const layout = seedLayout(
      [
        {
          profileId: 'home',
          repos: [
            { id: id(), name: 'command-center', folded: false, chats: [{ id: 'pane:a', session: 's-a' }, { id: 'pane:b' }] },
            { id: id(), name: 'mmorpg', folded: true, chats: [{ id: 'session:o' , session: 'o'}] }
          ]
        },
        { profileId: 'work', repos: [{ id: id(), name: 'work-repo', folded: false, chats: [{ id: 'pane:w' }] }] }
      ],
      TODAY
    )
    expect(shape(layout)).toEqual(['command-center: pane:a pane:b', 'mmorpg (folded): session:o', `${UNGROUPED}: `])
    expect(shape(layout, 'work')).toEqual(['work-repo: pane:w', `${UNGROUPED}: `])
    expect(layout.accounts.home.groups.map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(layout.accounts.home.known['pane:a']).toEqual({ seen: TODAY, session: 's-a' })
  })
})

const seeded = (): SidebarLayout =>
  seedLayout(
    [
      { profileId: 'home', repos: [{ id: id(), name: 'Today', folded: false, chats: [{ id: 'pane:a' }, { id: 'pane:b', session: 's-b' }] }] },
      { profileId: 'work', repos: [{ id: id(), name: 'Review', folded: false, chats: [{ id: 'session:v', session: 'v' }] }] }
    ],
    TODAY
  )

describe('Ungrouped’s place', () => {
  const OLD = { ungrouped: ['pane:n'], groups: [{ id: 'g1', name: 'Today', chats: ['pane:a'] }, { id: 'g2', name: 'Later', chats: [] }] }

  it('an older layout without one gets Ungrouped moved last, once', () => {
    const migrated = parseSidebarLayout({ accounts: { home: OLD, side: { ...OLD, groups: [] } } })!
    expect(shape(migrated)).toEqual(['Today: pane:a', 'Later: ', `${UNGROUPED}: pane:n`])
    expect(shape(migrated, 'side')).toEqual([`${UNGROUPED}: pane:n`])
    expect(migrated.accounts.home.ungroupedAt).toBe(2)
  })

  it('keeps a saved place across a reload, and reads one past the groups as last', () => {
    const first = parseSidebarLayout({ accounts: { home: { ...OLD, ungroupedAt: 0 } } })!
    expect(shape(parseSidebarLayout(JSON.parse(JSON.stringify(first)))!)).toEqual([`${UNGROUPED}: pane:n`, 'Today: pane:a', 'Later: '])
    expect(shape(parseSidebarLayout({ accounts: { home: { ...OLD, ungroupedAt: 9 } } })!)).toEqual(['Today: pane:a', 'Later: ', `${UNGROUPED}: pane:n`])
    expect(shape(parseSidebarLayout({ accounts: { home: { ...OLD, ungroupedAt: 1 } } })!)).toEqual(['Today: pane:a', `${UNGROUPED}: pane:n`, 'Later: '])
  })
})

describe('placing chats', () => {
  it('puts new chats at the top of Ungrouped, in the order given, and leaves placed ones alone', () => {
    const layout = placeChats(seeded(), [{ profileId: 'home', chats: [{ id: 'pane:a' }, { id: 'pane:n1' }, { id: 'pane:n2' }, { id: 'pane:b', session: 's-b' }] }], TODAY)
    expect(shape(layout)).toEqual(['Today: pane:a pane:b', `${UNGROUPED}: pane:n1 pane:n2`])
    const again = placeChats(layout, [{ profileId: 'home', chats: [{ id: 'pane:n3' }, { id: 'pane:n1' }] }], TODAY)
    expect(shape(again)[1]).toBe(`${UNGROUPED}: pane:n3 pane:n1 pane:n2`)
  })

  it('returns the same layout when nothing changed, so nothing is written', () => {
    const layout = seeded()
    expect(placeChats(layout, [{ profileId: 'home', chats: [{ id: 'pane:a' }, { id: 'pane:b', session: 's-b' }] }], TODAY)).toBe(layout)
  })

  it('places a chat in an account seen for the first time', () => {
    const layout = placeChats(seeded(), [{ profileId: 'side', chats: [{ id: 'pane:x' }] }], TODAY)
    expect(shape(layout, 'side')).toEqual([`${UNGROUPED}: pane:x`])
  })

  it('a chat taken over from VS Code keeps the VS Code row’s place', () => {
    const layout = placeChats(seeded(), [{ profileId: 'work', chats: [{ id: 'pane:t', session: 'v' }] }], TODAY)
    expect(shape(layout, 'work')).toEqual(['Review: pane:t', `${UNGROUPED}: `])
    expect(layout.accounts.work.known['session:v']).toBeUndefined()
  })

  it('a closed chat resumed in a new pane keeps its old place', () => {
    const layout = placeChats(seeded(), [{ profileId: 'home', chats: [{ id: 'pane:a' }, { id: 'pane:r', session: 's-b' }] }], TODAY + 3)
    expect(shape(layout)).toEqual(['Today: pane:a pane:r', `${UNGROUPED}: `])
  })

  it('never takes the place of a chat that is still open', () => {
    const chats = [{ id: 'pane:a' }, { id: 'pane:b', session: 's-b' }, { id: 'pane:fork', session: 's-b' }]
    const layout = placeChats(seeded(), [{ profileId: 'home', chats }], TODAY)
    expect(shape(layout)).toEqual(['Today: pane:a pane:b', `${UNGROUPED}: pane:fork`])
  })

  it('gives a placed chat with no day seen today’s, instead of pruning it', () => {
    const layout: SidebarLayout = { accounts: { home: { ungrouped: ['pane:x'], ungroupedFolded: false, ungroupedAt: 0, groups: [], known: {} } } }
    const placed = placeChats(layout, [{ profileId: 'home', chats: [] }], TODAY)
    expect(placed.accounts.home.ungrouped).toEqual(['pane:x'])
    expect(placed.accounts.home.known['pane:x']).toEqual({ seen: TODAY })
  })

  it('keeps a closed chat’s place for a while, then prunes it', () => {
    const open = [{ profileId: 'home', chats: [{ id: 'pane:a' }] }]
    const soon = placeChats(seeded(), open, TODAY + PRUNE_AFTER_DAYS)
    expect(shape(soon)).toEqual(['Today: pane:a pane:b', `${UNGROUPED}: `])
    const later = placeChats(soon, open, TODAY + PRUNE_AFTER_DAYS + 1)
    expect(shape(later)).toEqual(['Today: pane:a', `${UNGROUPED}: `])
    expect(Object.keys(later.accounts.home.known)).toEqual(['pane:a'])
  })
})

/** home: Ungrouped [n], Today [a b c], Review [r]; work: Work [w]. */
const three = (): SidebarLayout => {
  n = 0
  const layout = seedLayout(
    [
      {
        profileId: 'home',
        repos: [
          { id: id(), name: 'Today', folded: false, chats: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
          { id: id(), name: 'Review', folded: false, chats: [{ id: 'r' }] }
        ]
      },
      { profileId: 'work', repos: [{ id: id(), name: 'Work', folded: false, chats: [{ id: 'w' }] }] }
    ],
    TODAY
  )
  return placeChats(layout, [{ profileId: 'home', chats: [{ id: 'n' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'r' }] }], TODAY)
}
const TODAY_ID = 'g1'
const REVIEW_ID = 'g2'
const WORK_ID = 'g3'

describe('moving chats', () => {
  it('drops a chat before another chat of any group in its account', () => {
    expect(shape(moveChat(three(), 'home', 'c', { group: TODAY_ID, before: 'a' }))).toEqual(['Today: c a b', 'Review: r', `${UNGROUPED}: n`])
    expect(shape(moveChat(three(), 'home', 'a', { group: REVIEW_ID, before: 'r' }))).toEqual(['Today: b c', 'Review: a r', `${UNGROUPED}: n`])
  })

  it('drops a chat at the end of a group, or into Ungrouped', () => {
    expect(shape(moveChat(three(), 'home', 'a', { group: TODAY_ID, before: null }))).toEqual(['Today: b c a', 'Review: r', `${UNGROUPED}: n`])
    expect(shape(moveChat(three(), 'home', 'r', { group: UNGROUPED, before: 'n' }))).toEqual(['Today: a b c', 'Review: ', `${UNGROUPED}: r n`])
  })

  it('refuses a drop onto another account, a missing group or a chat elsewhere', () => {
    const layout = three()
    expect(moveChat(layout, 'home', 'a', { group: WORK_ID, before: null })).toBe(layout)
    expect(moveChat(layout, 'work', 'a', { group: WORK_ID, before: null })).toBe(layout)
    expect(moveChat(layout, 'home', 'a', { group: REVIEW_ID, before: 'b' })).toBe(layout)
    expect(moveChat(layout, 'home', 'a', { group: TODAY_ID, before: 'a' })).toBe(layout)
  })

  it('Alt+Up and Alt+Down step a chat past the next shown chat of its group, skipping closed ones, and stop at the ends', () => {
    const shown = new Set(['n', 'a', 'c', 'r'])
    expect(shape(moveChatStep(three(), 'home', 'c', shown, -1))).toEqual(['Today: c a b', 'Review: r', `${UNGROUPED}: n`])
    expect(shape(moveChatStep(three(), 'home', 'a', shown, 1))).toEqual(['Today: b c a', 'Review: r', `${UNGROUPED}: n`])
    const layout = three()
    expect(moveChatStep(layout, 'home', 'a', shown, -1)).toBe(layout)
    expect(moveChatStep(layout, 'home', 'r', shown, 1)).toBe(layout)
  })

  it('Alt+Shift+Down moves a chat to the top of the next group, Alt+Shift+Up to the end of the previous one, Ungrouped where it sits', () => {
    expect(shape(moveChatToNextGroup(three(), 'home', 'c', 1))).toEqual(['Today: a b', 'Review: c r', `${UNGROUPED}: n`])
    expect(shape(moveChatToNextGroup(three(), 'home', 'r', 1))).toEqual(['Today: a b c', 'Review: ', `${UNGROUPED}: r n`])
    expect(shape(moveChatToNextGroup(three(), 'home', 'n', -1))).toEqual(['Today: a b c', 'Review: r n', `${UNGROUPED}: `])
    const layout = three()
    expect(moveChatToNextGroup(layout, 'home', 'n', 1)).toBe(layout)
    expect(moveChatToNextGroup(layout, 'home', 'a', -1)).toBe(layout)
    const first = moveGroup(layout, 'home', UNGROUPED, TODAY_ID)
    expect(shape(moveChatToNextGroup(first, 'home', 'n', 1))).toEqual([`${UNGROUPED}: `, 'Today: n a b c', 'Review: r'])
    expect(shape(moveChatToNextGroup(first, 'home', 'a', -1))).toEqual([`${UNGROUPED}: n a`, 'Today: b c', 'Review: r'])
  })
})

describe('groups', () => {
  it('moves Ungrouped like a group, within its own account only', () => {
    expect(shape(moveGroup(three(), 'home', UNGROUPED, TODAY_ID))).toEqual([`${UNGROUPED}: n`, 'Today: a b c', 'Review: r'])
    expect(shape(moveGroup(three(), 'home', UNGROUPED, REVIEW_ID))).toEqual(['Today: a b c', `${UNGROUPED}: n`, 'Review: r'])
    const first = moveGroup(three(), 'home', UNGROUPED, TODAY_ID)
    expect(shape(moveGroup(first, 'home', UNGROUPED, null))).toEqual(['Today: a b c', 'Review: r', `${UNGROUPED}: n`])
    expect(shape(moveGroup(first, 'home', REVIEW_ID, UNGROUPED))).toEqual(['Review: r', `${UNGROUPED}: n`, 'Today: a b c'])
    expect(shape(moveGroup(three(), 'home', TODAY_ID, UNGROUPED))).toEqual(['Review: r', 'Today: a b c', `${UNGROUPED}: n`])
    const layout = three()
    expect(moveGroup(layout, 'home', UNGROUPED, null)).toBe(layout)
    expect(moveGroup(layout, 'home', UNGROUPED, WORK_ID)).toBe(layout)
    expect(moveGroup(layout, 'home', UNGROUPED, UNGROUPED)).toBe(layout)
  })

  it('a group dropped on a header goes right before or right after it, Ungrouped too', () => {
    expect(shape(moveGroupBeside(three(), 'home', TODAY_ID, REVIEW_ID, 'after'))).toEqual(['Review: r', 'Today: a b c', `${UNGROUPED}: n`])
    expect(shape(moveGroupBeside(three(), 'home', UNGROUPED, TODAY_ID, 'after'))).toEqual(['Today: a b c', `${UNGROUPED}: n`, 'Review: r'])
    expect(shape(moveGroupBeside(three(), 'home', TODAY_ID, UNGROUPED, 'after'))).toEqual(['Review: r', `${UNGROUPED}: n`, 'Today: a b c'])
    expect(shape(moveGroupBeside(three(), 'home', REVIEW_ID, TODAY_ID, 'before'))).toEqual(['Review: r', 'Today: a b c', `${UNGROUPED}: n`])
    const layout = three()
    expect(moveGroupBeside(layout, 'home', TODAY_ID, REVIEW_ID, 'before')).toBe(layout)
    expect(moveGroupBeside(layout, 'home', TODAY_ID, WORK_ID, 'after')).toBe(layout)
  })

  it('reorders a group before another, or to the very end, below Ungrouped', () => {
    expect(shape(moveGroup(three(), 'home', REVIEW_ID, TODAY_ID))).toEqual(['Review: r', 'Today: a b c', `${UNGROUPED}: n`])
    expect(shape(moveGroup(three(), 'home', TODAY_ID, null))).toEqual(['Review: r', `${UNGROUPED}: n`, 'Today: a b c'])
    const layout = three()
    expect(moveGroup(layout, 'home', WORK_ID, null)).toBe(layout)
  })

  it('a new group goes last, or right after the chat’s group it is made from, taking the chat; never below an Ungrouped that is last', () => {
    expect(shape(createGroup(three(), 'home', { id: 'x', name: ' Later ' }))).toEqual(['Today: a b c', 'Review: r', 'Later: ', `${UNGROUPED}: n`])
    expect(shape(createGroup(three(), 'home', { id: 'x', name: 'Hot', chat: 'b' }))).toEqual(['Today: a c', 'Hot: b', 'Review: r', `${UNGROUPED}: n`])
    expect(shape(createGroup(three(), 'home', { id: 'x', name: 'Hot', chat: 'n' }))).toEqual(['Today: a b c', 'Review: r', 'Hot: n', `${UNGROUPED}: `])
    expect(shape(createGroup(three(), 'home', { id: 'x', name: 'Hot', chat: 'r' }))).toEqual(['Today: a b c', 'Review: ', 'Hot: r', `${UNGROUPED}: n`])
    const first = moveGroup(three(), 'home', UNGROUPED, TODAY_ID)
    expect(shape(createGroup(first, 'home', { id: 'x', name: 'Hot', chat: 'n' }))).toEqual([`${UNGROUPED}: `, 'Hot: n', 'Today: a b c', 'Review: r'])
    expect(shape(createGroup(first, 'home', { id: 'x', name: 'Later' }))).toEqual([`${UNGROUPED}: n`, 'Today: a b c', 'Review: r', 'Later: '])
    expect(shape(createGroup(three(), 'fresh', { id: 'x', name: 'First' }), 'fresh')).toEqual(['First: ', `${UNGROUPED}: `])
  })

  it('renames a group; an empty name keeps the old one', () => {
    expect(shape(renameGroup(three(), 'home', REVIEW_ID, ' Waiting on review '))[1]).toBe('Waiting on review: r')
    const layout = three()
    expect(renameGroup(layout, 'home', REVIEW_ID, '  ')).toBe(layout)
  })

  it('deleting a group moves its chats to the end of Ungrouped, never deleting them; Ungrouped keeps its place', () => {
    const layout = deleteGroup(three(), 'home', TODAY_ID)
    expect(shape(layout)).toEqual(['Review: r', `${UNGROUPED}: n a b c`])
    expect(groupOf(layout, 'home', 'a')).toBe(UNGROUPED)
    const between = moveGroup(three(), 'home', UNGROUPED, REVIEW_ID)
    expect(shape(deleteGroup(between, 'home', TODAY_ID))).toEqual([`${UNGROUPED}: n a b c`, 'Review: r'])
    expect(shape(deleteGroup(between, 'home', REVIEW_ID))).toEqual(['Today: a b c', `${UNGROUPED}: n r`])
  })

  it('folds and opens a group or Ungrouped', () => {
    expect(shape(setFolded(three(), 'home', REVIEW_ID, true))[1]).toBe('Review (folded): r')
    expect(setFolded(three(), 'home', UNGROUPED, true).accounts.home.ungroupedFolded).toBe(true)
  })

  it('finds the group a chat is in', () => {
    expect(groupOf(three(), 'home', 'r')).toBe(REVIEW_ID)
    expect(groupOf(three(), 'home', 'w')).toBeNull()
  })
})
