import { describe, expect, it } from 'vitest'
import { shortcutApplies, shortcutFor, type KeyChord } from './shortcutMap'

const ctrl = (key: string, code: string): KeyChord => ({ key, code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
const ctrlShift = (key: string, code: string): KeyChord => ({ ...ctrl(key, code), shiftKey: true })
const alt = (key: string, code: string): KeyChord => ({ key, code, ctrlKey: false, metaKey: false, altKey: true, shiftKey: false })
const plain = (key: string, code: string): KeyChord => ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })

describe('keyboard shortcuts', () => {
  it('Ctrl+1/2/3 pick Dashboard, Work and Board', () => {
    expect(shortcutFor(ctrl('1', 'Digit1'))).toEqual({ name: 'switchView', view: 'dashboard' })
    expect(shortcutFor(ctrl('2', 'Digit2'))).toEqual({ name: 'switchView', view: 'work' })
    expect(shortcutFor(ctrl('3', 'Digit3'))).toEqual({ name: 'switchView', view: 'board' })
  })

  it('Ctrl+4 and up do nothing', () => {
    expect(shortcutFor(ctrl('4', 'Digit4'))).toBeNull()
  })

  it('Ctrl+, opens Settings, by key or by position', () => {
    expect(shortcutFor(ctrl(',', 'Comma'))).toEqual({ name: 'openSettings' })
    expect(shortcutFor(ctrl(';', 'Comma'))).toEqual({ name: 'openSettings' })
  })

  it('Alt+1..9 pick a session list row by position', () => {
    expect(shortcutFor(alt('1', 'Digit1'))).toEqual({ name: 'selectRow', index: 0 })
    expect(shortcutFor(alt('9', 'Digit9'))).toEqual({ name: 'selectRow', index: 8 })
  })

  it('AltGr (Ctrl+Alt) with a digit is typing, not a shortcut', () => {
    expect(shortcutFor({ key: '@', code: 'Digit2', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false })).toBeNull()
  })

  it('Ctrl+Shift+J jumps to the next waiting session', () => {
    expect(shortcutFor(ctrlShift('J', 'KeyJ'))).toEqual({ name: 'nextWaiting' })
  })

  it('leaves the prompt box its keys: Ctrl+J newline, Enter, Ctrl+Enter, Shift+Enter, Shift+Tab, Escape', () => {
    const promptKeys = [
      ctrl('j', 'KeyJ'),
      plain('Enter', 'Enter'),
      ctrl('Enter', 'Enter'),
      { ...plain('Enter', 'Enter'), shiftKey: true },
      { ...plain('Tab', 'Tab'), shiftKey: true },
      plain('Escape', 'Escape'),
      plain('ArrowUp', 'ArrowUp'),
      plain('ArrowDown', 'ArrowDown')
    ]
    expect(promptKeys.map(shortcutFor)).toEqual(promptKeys.map(() => null))
  })

  it('Shift does not turn a Ctrl shortcut into another one', () => {
    expect(shortcutFor(ctrlShift('T', 'KeyT'))).toBeNull()
    expect(shortcutFor(ctrlShift('K', 'KeyK'))).toBeNull()
  })

  it('keeps Ctrl+B and Ctrl+` (by position)', () => {
    expect(shortcutFor(ctrl('b', 'KeyB'))).toEqual({ name: 'toggleIdePanels' })
    expect(shortcutFor(ctrl('§', 'Backquote'))).toEqual({ name: 'toggleShellDrawer' })
  })

  it('keeps the chat shortcuts', () => {
    expect(shortcutFor(ctrl('t', 'KeyT'))).toEqual({ name: 'newChat' })
    expect(shortcutFor(ctrl('w', 'KeyW'))).toEqual({ name: 'closeActiveChat' })
    expect(shortcutFor(ctrl('k', 'KeyK'))).toEqual({ name: 'focusInput' })
    expect(shortcutFor(ctrl('l', 'KeyL'))).toEqual({ name: 'loadPastSession' })
  })

  it('gives every chord at most one action', () => {
    const chords = [
      ...['1', '2', '3'].map((d) => ctrl(d, `Digit${d}`)),
      ctrl(',', 'Comma'),
      ctrlShift('J', 'KeyJ'),
      ctrl('b', 'KeyB'),
      ctrl('`', 'Backquote'),
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => alt(d, `Digit${d}`))
    ]
    const names = chords.map((c) => JSON.stringify(shortcutFor(c)))
    expect(new Set(names).size).toBe(chords.length)
    expect(names).not.toContain('null')
  })

  describe('outside Work', () => {
    const workOnly = [ctrl('t', 'KeyT'), ctrl('w', 'KeyW'), ctrl('k', 'KeyK'), ctrl('b', 'KeyB'), ctrl('`', 'Backquote'), alt('1', 'Digit1')]
    const everywhere = [ctrl('1', 'Digit1'), ctrl('2', 'Digit2'), ctrl(',', 'Comma'), ctrlShift('J', 'KeyJ')]
    const applies = (c: KeyChord, screen: Parameters<typeof shortcutApplies>[1]) => shortcutApplies(shortcutFor(c)!, screen)

    it('leaves the chat, row, IDE and shell shortcuts to Work', () => {
      for (const view of ['dashboard', 'board'] as const) {
        expect(workOnly.map((c) => applies(c, { view, settingsOpen: false }))).toEqual(workOnly.map(() => false))
      }
      expect(workOnly.map((c) => applies(c, { view: 'work', settingsOpen: true }))).toEqual(workOnly.map(() => false))
      expect(workOnly.map((c) => applies(c, { view: 'work', settingsOpen: false }))).toEqual(workOnly.map(() => true))
    })

    it('keeps view switching, Settings and Ctrl+Shift+J everywhere', () => {
      expect(everywhere.map((c) => applies(c, { view: 'board', settingsOpen: true }))).toEqual(everywhere.map(() => true))
    })
  })

  it('ignores unmodified keys', () => {
    expect(shortcutFor(plain('1', 'Digit1'))).toBeNull()
    expect(shortcutFor(plain(',', 'Comma'))).toBeNull()
  })
})
