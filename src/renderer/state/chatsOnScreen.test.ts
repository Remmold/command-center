import { describe, expect, it } from 'vitest'
import type { ChatPair } from './chatPair'
import { hostedChatOnScreen, type Screen } from './chatsOnScreen'

const split: ChatPair = { halves: [{ kind: 'hosted', paneId: 'a' }, { kind: 'hosted', paneId: 'b' }], focused: 0 }
const screen = (over: Partial<Screen> = {}): Screen => ({
  view: 'work',
  settingsOpen: false,
  windowVisible: true,
  pair: split,
  chatTabShown: true,
  inDrawer: false,
  ...over
})

describe('hostedChatOnScreen', () => {
  it('is true for both halves of a split shown in Work, and false for a chat in no half', () => {
    expect(hostedChatOnScreen('a', screen())).toBe(true)
    expect(hostedChatOnScreen('b', screen())).toBe(true)
    expect(hostedChatOnScreen('c', screen())).toBe(false)
  })

  it('is false for every chat while another view, Settings or a hidden window covers Work', () => {
    for (const covered of [screen({ view: 'dashboard' }), screen({ view: 'board' }), screen({ settingsOpen: true }), screen({ windowVisible: false })]) {
      expect(hostedChatOnScreen('a', covered)).toBe(false)
      expect(hostedChatOnScreen('b', covered)).toBe(false)
    }
  })

  it('is false for the focused chat while a file or diff takes its place, true again on its chat tab', () => {
    const editing = screen({ chatTabShown: false })
    expect(hostedChatOnScreen('a', editing)).toBe(false)
    expect(hostedChatOnScreen('b', editing)).toBe(true)
    expect(hostedChatOnScreen('a', screen({ chatTabShown: true }))).toBe(true)
  })
})

describe("the Dashboard drawer's chat", () => {
  it('is on screen while the Dashboard shows it, and no other chat is', () => {
    expect(hostedChatOnScreen('c', screen({ view: 'dashboard', inDrawer: true }))).toBe(true)
    expect(hostedChatOnScreen('a', screen({ view: 'dashboard', inDrawer: false }))).toBe(false)
  })

  it('is not on screen under Settings, in a hidden window, or in any other view', () => {
    for (const covered of [
      screen({ view: 'dashboard', inDrawer: true, settingsOpen: true }),
      screen({ view: 'dashboard', inDrawer: true, windowVisible: false }),
      screen({ view: 'board', inDrawer: true }),
      screen({ view: 'work', inDrawer: true })
    ]) {
      expect(hostedChatOnScreen('c', covered)).toBe(false)
    }
  })

  it("leaves Work's chats on screen in Work when the drawer holds the same session", () => {
    expect(hostedChatOnScreen('a', screen({ inDrawer: true }))).toBe(true)
  })
})
