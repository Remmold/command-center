import { describe, expect, it } from 'vitest'
import { beforeFocusedElement, shortcutApplies, shortcutFor, type KeyChord } from './shortcutMap'

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

  it('Ctrl+B shows or hides the session list, as VS Code does its sidebar', () => {
    expect(shortcutFor(ctrl('b', 'KeyB'))).toEqual({ name: 'toggleSessionList' })
  })

  it('Ctrl+Shift+E shows the IDE panels, as VS Code does its Explorer', () => {
    expect(shortcutFor(ctrlShift('E', 'KeyE'))).toEqual({ name: 'toggleIdePanels' })
  })

  it('Ctrl+Shift+M shows the Media panel of the focused chat; Ctrl+M alone does nothing', () => {
    expect(shortcutFor(ctrlShift('M', 'KeyM'))).toEqual({ name: 'toggleMediaPanel' })
    expect(shortcutFor(ctrl('m', 'KeyM'))).toBeNull()
  })

  it('zoom and Ctrl+B go before a focused shell or prompt box, as on the VS Code skip-shell list; the rest leave a shell its keys', () => {
    const first = [ctrl('=', 'Equal'), ctrl('-', 'Minus'), ctrl('0', 'Digit0'), ctrl('b', 'KeyB')]
    const after = [ctrl('t', 'KeyT'), ctrl('k', 'KeyK'), ctrlShift('E', 'KeyE'), ctrl('`', 'Backquote'), ctrl('1', 'Digit1')]
    expect(first.map((c) => beforeFocusedElement(shortcutFor(c)!))).toEqual(first.map(() => true))
    expect(after.map((c) => beforeFocusedElement(shortcutFor(c)!))).toEqual(after.map(() => false))
  })

  it('keeps Ctrl+` (by position)', () => {
    expect(shortcutFor(ctrl('§', 'Backquote'))).toEqual({ name: 'toggleShellDrawer' })
  })

  describe('zoom', () => {
    it('Ctrl+= and Ctrl++ zoom in, also on the number pad', () => {
      expect(shortcutFor(ctrl('=', 'Equal'))).toEqual({ name: 'zoom', step: 'in' })
      expect(shortcutFor(ctrlShift('+', 'Equal'))).toEqual({ name: 'zoom', step: 'in' })
      expect(shortcutFor(ctrl('+', 'NumpadAdd'))).toEqual({ name: 'zoom', step: 'in' })
    })

    it('Ctrl+- zooms out, also on the number pad', () => {
      expect(shortcutFor(ctrl('-', 'Minus'))).toEqual({ name: 'zoom', step: 'out' })
      expect(shortcutFor(ctrl('-', 'NumpadSubtract'))).toEqual({ name: 'zoom', step: 'out' })
    })

    it('Ctrl+0 resets, by key or by position', () => {
      expect(shortcutFor(ctrl('0', 'Digit0'))).toEqual({ name: 'zoom', step: 'reset' })
      expect(shortcutFor(ctrl('à', 'Digit0'))).toEqual({ name: 'zoom', step: 'reset' })
      expect(shortcutFor(ctrl('0', 'Numpad0'))).toEqual({ name: 'zoom', step: 'reset' })
    })

    it('follows the printed key on Nordic layouts: + on the Minus key, - on the Slash key', () => {
      expect(shortcutFor(ctrl('+', 'Minus'))).toEqual({ name: 'zoom', step: 'in' })
      expect(shortcutFor(ctrl('-', 'Slash'))).toEqual({ name: 'zoom', step: 'out' })
    })

    it('AltGr (Ctrl+Alt) is typing, not zoom', () => {
      expect(shortcutFor({ ...ctrl('+', 'Minus'), altKey: true })).toBeNull()
      expect(shortcutFor({ ...ctrl('0', 'Digit0'), altKey: true })).toBeNull()
    })

    it('works on every screen', () => {
      for (const step of ['in', 'out', 'reset'] as const) {
        expect(shortcutApplies({ name: 'zoom', step }, { view: 'board', settingsOpen: true })).toBe(true)
      }
    })
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
      ctrlShift('E', 'KeyE'),
      ctrl('`', 'Backquote'),
      ctrl('=', 'Equal'),
      ctrl('-', 'Minus'),
      ctrl('0', 'Digit0'),
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => alt(d, `Digit${d}`))
    ]
    const names = chords.map((c) => JSON.stringify(shortcutFor(c)))
    expect(new Set(names).size).toBe(chords.length)
    expect(names).not.toContain('null')
  })

  describe('outside Work', () => {
    const workOnly = [ctrl('t', 'KeyT'), ctrl('w', 'KeyW'), ctrl('k', 'KeyK'), ctrl('b', 'KeyB'), ctrlShift('E', 'KeyE'), ctrl('`', 'Backquote'), alt('1', 'Digit1')]
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
