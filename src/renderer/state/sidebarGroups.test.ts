import { describe, expect, it } from 'vitest'
import { UNGROUPED, type AccountLayout, type SidebarLayout } from '../../shared/sidebarGroups'
import {
  createGroup,
  deleteGroup,
  groupOf,
  moveChat,
  moveChatStep,
  moveChatToNextGroup,
  moveGroup,
  placeChats,
  PRUNE_AFTER_DAYS,
  renameGroup,
  seedLayout,
  setFolded
} from './sidebarGroups'

const TODAY = 1000

let n = 0
const id = () => `g${++n}`

/** Each group as `name: chats`, Ungrouped first. */
function shape(layout: SidebarLayout, profileId = 'home'): string[] {
  const a: AccountLayout = layout.accounts[profileId]
  return [`${UNGROUPED}: ${a.ungrouped.join(' ')}`, ...a.groups.map((g) => `${g.name}${g.folded ? ' (folded)' : ''}: ${g.chats.join(' ')}`)]
}

describe('seeding from repo groups', () => {
  it('gives each account its repo groups as own groups, same names, order, members and folds, Ungrouped empty', () => {
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
    expect(shape(layout)).toEqual([`${UNGROUPED}: `, 'command-center: pane:a pane:b', 'mmorpg (folded): session:o'])
    expect(shape(layout, 'work')).toEqual([`${UNGROUPED}: `, 'work-repo: pane:w'])
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

describe('placing chats', () => {
  it('puts new chats at the top of Ungrouped, in the order given, and leaves placed ones alone', () => {
    const layout = placeChats(seeded(), [{ profileId: 'home', chats: [{ id: 'pane:a' }, { id: 'pane:n1' }, { id: 'pane:n2' }, { id: 'pane:b', session: 's-b' }] }], TODAY)
    expect(shape(layout)).toEqual([`${UNGROUPED}: pane:n1 pane:n2`, 'Today: pane:a pane:b'])
    const again = placeChats(layout, [{ profileId: 'home', chats: [{ id: 'pane:n3' }, { id: 'pane:n1' }] }], TODAY)
    expect(shape(again)[0]).toBe(`${UNGROUPED}: pane:n3 pane:n1 pane:n2`)
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
    expect(shape(layout, 'work')).toEqual([`${UNGROUPED}: `, 'Review: pane:t'])
    expect(layout.accounts.work.known['session:v']).toBeUndefined()
  })

  it('a closed chat resumed in a new pane keeps its old place', () => {
    const layout = placeChats(seeded(), [{ profileId: 'home', chats: [{ id: 'pane:a' }, { id: 'pane:r', session: 's-b' }] }], TODAY + 3)
    expect(shape(layout)).toEqual([`${UNGROUPED}: `, 'Today: pane:a pane:r'])
  })

  it('never takes the place of a chat that is still open', () => {
    const chats = [{ id: 'pane:a' }, { id: 'pane:b', session: 's-b' }, { id: 'pane:fork', session: 's-b' }]
    const layout = placeChats(seeded(), [{ profileId: 'home', chats }], TODAY)
    expect(shape(layout)).toEqual([`${UNGROUPED}: pane:fork`, 'Today: pane:a pane:b'])
  })

  it('gives a placed chat with no day seen today’s, instead of pruning it', () => {
    const layout: SidebarLayout = { accounts: { home: { ungrouped: ['pane:x'], ungroupedFolded: false, groups: [], known: {} } } }
    const placed = placeChats(layout, [{ profileId: 'home', chats: [] }], TODAY)
    expect(placed.accounts.home.ungrouped).toEqual(['pane:x'])
    expect(placed.accounts.home.known['pane:x']).toEqual({ seen: TODAY })
  })

  it('keeps a closed chat’s place for a while, then prunes it', () => {
    const open = [{ profileId: 'home', chats: [{ id: 'pane:a' }] }]
    const soon = placeChats(seeded(), open, TODAY + PRUNE_AFTER_DAYS)
    expect(shape(soon)).toEqual([`${UNGROUPED}: `, 'Today: pane:a pane:b'])
    const later = placeChats(soon, open, TODAY + PRUNE_AFTER_DAYS + 1)
    expect(shape(later)).toEqual([`${UNGROUPED}: `, 'Today: pane:a'])
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
    expect(shape(moveChat(three(), 'home', 'c', { group: TODAY_ID, before: 'a' }))).toEqual([`${UNGROUPED}: n`, 'Today: c a b', 'Review: r'])
    expect(shape(moveChat(three(), 'home', 'a', { group: REVIEW_ID, before: 'r' }))).toEqual([`${UNGROUPED}: n`, 'Today: b c', 'Review: a r'])
  })

  it('drops a chat at the end of a group, or into Ungrouped', () => {
    expect(shape(moveChat(three(), 'home', 'a', { group: TODAY_ID, before: null }))).toEqual([`${UNGROUPED}: n`, 'Today: b c a', 'Review: r'])
    expect(shape(moveChat(three(), 'home', 'r', { group: UNGROUPED, before: 'n' }))).toEqual([`${UNGROUPED}: r n`, 'Today: a b c', 'Review: '])
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
    expect(shape(moveChatStep(three(), 'home', 'c', shown, -1))).toEqual([`${UNGROUPED}: n`, 'Today: c a b', 'Review: r'])
    expect(shape(moveChatStep(three(), 'home', 'a', shown, 1))).toEqual([`${UNGROUPED}: n`, 'Today: b c a', 'Review: r'])
    const layout = three()
    expect(moveChatStep(layout, 'home', 'a', shown, -1)).toBe(layout)
    expect(moveChatStep(layout, 'home', 'r', shown, 1)).toBe(layout)
  })

  it('Alt+Shift+Down moves a chat to the top of the next group, Alt+Shift+Up to the end of the previous one, Ungrouped first', () => {
    expect(shape(moveChatToNextGroup(three(), 'home', 'c', 1))).toEqual([`${UNGROUPED}: n`, 'Today: a b', 'Review: c r'])
    expect(shape(moveChatToNextGroup(three(), 'home', 'a', -1))).toEqual([`${UNGROUPED}: n a`, 'Today: b c', 'Review: r'])
    expect(shape(moveChatToNextGroup(three(), 'home', 'n', 1))).toEqual([`${UNGROUPED}: `, 'Today: n a b c', 'Review: r'])
    const layout = three()
    expect(moveChatToNextGroup(layout, 'home', 'r', 1)).toBe(layout)
    expect(moveChatToNextGroup(layout, 'home', 'n', -1)).toBe(layout)
  })
})

describe('groups', () => {
  it('reorders a group before another, or to the end', () => {
    expect(shape(moveGroup(three(), 'home', REVIEW_ID, TODAY_ID))).toEqual([`${UNGROUPED}: n`, 'Review: r', 'Today: a b c'])
    expect(shape(moveGroup(three(), 'home', TODAY_ID, null))).toEqual([`${UNGROUPED}: n`, 'Review: r', 'Today: a b c'])
    const layout = three()
    expect(moveGroup(layout, 'home', WORK_ID, null)).toBe(layout)
  })

  it('a new group goes last; one made from a chat goes right after the chat’s group and takes the chat', () => {
    expect(shape(createGroup(three(), 'home', { id: 'x', name: ' Later ' }))).toEqual([`${UNGROUPED}: n`, 'Today: a b c', 'Review: r', 'Later: '])
    expect(shape(createGroup(three(), 'home', { id: 'x', name: 'Hot', chat: 'b' }))).toEqual([`${UNGROUPED}: n`, 'Today: a c', 'Hot: b', 'Review: r'])
    expect(shape(createGroup(three(), 'home', { id: 'x', name: 'Hot', chat: 'n' }))).toEqual([`${UNGROUPED}: `, 'Hot: n', 'Today: a b c', 'Review: r'])
    expect(shape(createGroup(three(), 'fresh', { id: 'x', name: 'First' }), 'fresh')).toEqual([`${UNGROUPED}: `, 'First: '])
  })

  it('renames a group; an empty name keeps the old one', () => {
    expect(shape(renameGroup(three(), 'home', REVIEW_ID, ' Waiting on review '))[2]).toBe('Waiting on review: r')
    const layout = three()
    expect(renameGroup(layout, 'home', REVIEW_ID, '  ')).toBe(layout)
  })

  it('deleting a group moves its chats to the end of Ungrouped, never deleting them', () => {
    const layout = deleteGroup(three(), 'home', TODAY_ID)
    expect(shape(layout)).toEqual([`${UNGROUPED}: n a b c`, 'Review: r'])
    expect(groupOf(layout, 'home', 'a')).toBe(UNGROUPED)
  })

  it('folds and opens a group or Ungrouped', () => {
    expect(shape(setFolded(three(), 'home', REVIEW_ID, true))[2]).toBe('Review (folded): r')
    expect(setFolded(three(), 'home', UNGROUPED, true).accounts.home.ungroupedFolded).toBe(true)
  })

  it('finds the group a chat is in', () => {
    expect(groupOf(three(), 'home', 'r')).toBe(REVIEW_ID)
    expect(groupOf(three(), 'home', 'w')).toBeNull()
  })
})
