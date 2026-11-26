import { describe, expect, it } from 'vitest'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
  actionKeys,
  addKeyEdits,
  bindingLabel,
  keyEditWords, otherTopKeys,
  keybindingAction,
  keystrokeText,
  normalBinding,
  otherBindings,
  reservedReason,
  resetEdits,
  unbindEdits
} from './keybindings'
import schema from './fixtures/claude-code-keybindings.schema.json'

/** Actions the schema snapshot still lists that the keybindings docs retired or never document; a file naming one shows under Other bindings. */
const SCHEMA_ONLY_ACTIONS = [
  'app:toggleBrief',
  'app:openArtifact',
  'chat:workflowKeywordToggle',
  'confirm:toggleExplanation',
  'messageSelector:up',
  'messageSelector:down',
  'messageSelector:top',
  'messageSelector:bottom',
  'messageSelector:select',
  'diff:viewDetails',
  'theme:editCustom',
  'settings:periodDay',
  'settings:periodWeek',
  'settings:sortByTokens'
]

const defs = (
  schema as unknown as {
    $defs: { context: { enum: string[] }; builtinAction: { enum: string[] } }
  }
).$defs

describe('the key-binding catalog', () => {
  it('has every context and action the schema documents, each action under a known context once', () => {
    const contexts = KEYBINDING_CONTEXTS.map((c) => c.name)
    for (const name of defs.context.enum) expect(contexts, name).toContain(name)
    const actions = new Set(KEYBINDING_ACTIONS.map((a) => a.action))
    for (const action of defs.builtinAction.enum.filter((a) => !SCHEMA_ONLY_ACTIONS.includes(a))) expect(actions.has(action), action).toBe(true)
    for (const action of SCHEMA_ONLY_ACTIONS) expect(actions.has(action), action).toBe(false)
    const rows = KEYBINDING_ACTIONS.map((a) => `${a.context} ${a.action}`)
    expect(new Set(rows).size).toBe(rows.length)
    for (const a of KEYBINDING_ACTIONS) expect(contexts, a.action).toContain(a.context)
  })

  it('writes each default key the way a captured key is written', () => {
    for (const { action, defaults } of KEYBINDING_ACTIONS) for (const key of defaults) expect(normalBinding(key), action).toBe(key)
    expect(KEYBINDING_ACTIONS.find((a) => a.action === 'chat:externalEditor')?.defaults).toEqual(['ctrl+g', 'ctrl+x ctrl+e'])
    expect(KEYBINDING_ACTIONS.find((a) => a.action === 'chat:modelPicker')?.defaults).toEqual(['alt+p'])
  })
})

const press = (key: string, code: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  key,
  code,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  metaKey: mods.meta ?? false
})

describe('capturing a key', () => {
  it('turns key presses into binding text that reads back the same, chords included', () => {
    const chord = [press('k', 'KeyK', { ctrl: true }), press('s', 'KeyS', { ctrl: true })].map(keystrokeText).join(' ')
    expect(chord).toBe('ctrl+k ctrl+s')
    expect(normalBinding(chord)).toBe(chord)
    expect(bindingLabel(chord)).toBe('Ctrl+K Ctrl+S')
    expect(keystrokeText(press('Tab', 'Tab', { shift: true }))).toBe('shift+tab')
    expect(keystrokeText(press('K', 'KeyK', { shift: true }))).toBe('shift+k')
    expect(keystrokeText(press('_', 'Minus', { ctrl: true, shift: true }))).toBe('ctrl+shift+-')
    expect(keystrokeText(press('π', 'KeyP', { alt: true }))).toBe('alt+p')
    expect(keystrokeText(press('ArrowUp', 'ArrowUp'))).toBe('up')
    expect(keystrokeText(press(' ', 'Space'))).toBe('space')
    expect(keystrokeText(press('Escape', 'Escape'))).toBe('escape')
    expect(keystrokeText(press('Control', 'ControlLeft', { ctrl: true }))).toBeNull()
    expect(keystrokeText({ ...press('@', 'Digit2', { ctrl: true, alt: true }), altGraph: true })).toBe('@')
    expect(bindingLabel('ctrl++')).toBe('Ctrl++')
    expect(bindingLabel('ctrl+')).toBe('Ctrl+')
  })

  it('reads every spelling the docs allow as one binding', () => {
    expect(normalBinding('Meta+P')).toBe('alt+p')
    expect(normalBinding('control+shift+K')).toBe('ctrl+shift+k')
    expect(normalBinding('shift+ctrl+k')).toBe('ctrl+shift+k')
    expect(normalBinding('win+e')).toBe('cmd+e')
    expect(normalBinding('Esc')).toBe('escape')
    expect(normalBinding('ctrl+x  return')).toBe('ctrl+x enter')
    expect(bindingLabel('alt+p')).toBe('Alt+P')
  })

  it('refuses the reserved keys with a reason, also as one key of a chord', () => {
    for (const key of ['ctrl+c', 'ctrl+d', 'ctrl+m', 'ctrl+[', 'ctrl+i', 'ctrl+h', 'Ctrl+C', 'ctrl+k ctrl+d']) expect(reservedReason(key), key).toMatch(/\w/)
    expect(keystrokeText(press('CapsLock', 'CapsLock'))).toBe('capslock')
    expect(reservedReason('capslock')).toMatch(/terminal/)
    expect(reservedReason('ctrl+k ctrl+s')).toBeNull()
    expect(reservedReason('ctrl+shift+c')).toBeNull()
  })
})

describe('editing an action’s keys', () => {
  const editor = keybindingAction('Chat', 'chat:externalEditor')!
  const stash = keybindingAction('Chat', 'chat:stash')!
  const file = {
    'Ctrl+G': null,
    'alt+e': 'chat:externalEditor',
    'ctrl+s': 'chat:externalEditor'
  }

  it('shows the built-in keys the file leaves alone and the keys the file adds, under any spelling', () => {
    expect(actionKeys(editor, undefined)).toEqual([
      { binding: 'ctrl+g', fromFile: false },
      { binding: 'ctrl+x ctrl+e', fromFile: false }
    ])
    expect(actionKeys(editor, file)).toEqual([
      { binding: 'ctrl+x ctrl+e', fromFile: false },
      { binding: 'alt+e', fromFile: true },
      { binding: 'ctrl+s', fromFile: true }
    ])
    expect(actionKeys(stash, file)).toEqual([])
  })

  it('adds a key, unbinds one and resets the action to its built-in keys as changes to the file’s entries', () => {
    expect(addKeyEdits(editor, undefined, 'ctrl+k ctrl+e')).toEqual([{ path: 'bindings.Chat.ctrl+k ctrl+e', value: 'chat:externalEditor' }])
    expect(addKeyEdits(editor, file, 'ctrl+g')).toEqual([{ path: 'bindings.Chat.Ctrl+G', value: undefined }])
    expect(unbindEdits(editor, undefined, 'ctrl+x ctrl+e')).toEqual([{ path: 'bindings.Chat.ctrl+x ctrl+e', value: null }])
    expect(unbindEdits(editor, file, 'alt+e')).toEqual([{ path: 'bindings.Chat.alt+e', value: undefined }])
    expect(unbindEdits(editor, file, 'ctrl+s')).toEqual([{ path: 'bindings.Chat.ctrl+s', value: null }])
    expect(resetEdits(editor, file)).toEqual([
      { path: 'bindings.Chat.Ctrl+G', value: undefined },
      { path: 'bindings.Chat.alt+e', value: undefined },
      { path: 'bindings.Chat.ctrl+s', value: undefined }
    ])
  })

  it('names a change for Review by its context, keys and what they run', () => {
    const { label, format } = keyEditWords('bindings.Chat.ctrl+k ctrl+s')
    expect(label).toBe('The prompt box · Ctrl+K Ctrl+S')
    expect([undefined, null, 'chat:stash', 'command:compact', 'future:x'].map(format)).toEqual(['no action', 'nothing (unbound)', 'Put the prompt aside', 'the command /compact', 'future:x'])
    expect(keyEditWords('bindings.Chat.Ctrl+S').format(undefined)).toBe('Put the prompt aside (built in)')
  })

  it('keeps keys of the file that are not bindings visible, but not its schema and docs lines', () => {
    expect(otherTopKeys({ $schema: 'x', $docs: 'y', bindings: [], stray: 1 })).toEqual([['stray', 1]])
    expect(otherBindings('not an object')).toEqual([])
  })

  it('lists the file’s entries no action row shows, unknown contexts and actions included', () => {
    const bindings = {
      Chat: {
        ...file,
        'alt+g': 'command:compact',
        'ctrl+y': 'chat:future',
        'ctrl+l': 'command:clear'
      },
      Future: { 'ctrl+q': 'future:quit' },
      Global: { 'ctrl+t': null }
    }
    expect(otherBindings(bindings)).toEqual([
      { context: 'Chat', key: 'alt+g', value: 'command:compact' },
      { context: 'Chat', key: 'ctrl+y', value: 'chat:future' },
      { context: 'Chat', key: 'ctrl+l', value: 'command:clear' },
      { context: 'Future', key: 'ctrl+q', value: 'future:quit' }
    ])
  })
})
