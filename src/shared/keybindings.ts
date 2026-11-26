import { keyPath, pathKeys } from './claudeSettings'

/** Where in terminal Claude a block of bindings applies. */
export interface KeybindingContext {
  name: string
  label: string
}

/** One action terminal Claude runs on a key, in the context whose keys run it. */
export interface KeybindingAction {
  context: string
  action: string
  label: string
  /** The built-in keys, as binding text; empty when unbound by default. */
  defaults: readonly string[]
}

export const KEYBINDINGS_SCHEMA_URL = 'https://www.schemastore.org/claude-code-keybindings.json'
export const KEYBINDINGS_DOCS_URL = 'https://code.claude.com/docs/en/keybindings'

/** Every context the keybindings docs list, in their order. */
export const KEYBINDING_CONTEXTS: readonly KeybindingContext[] = [
  { name: 'Global', label: 'Everywhere' },
  { name: 'Chat', label: 'The prompt box' },
  { name: 'Autocomplete', label: 'An open suggestion menu' },
  { name: 'Settings', label: 'The /config settings panel' },
  { name: 'Confirmation', label: 'Permission and confirmation questions' },
  { name: 'Tabs', label: 'Tabs in a dialog' },
  { name: 'Help', label: 'The help menu' },
  { name: 'Transcript', label: 'The transcript viewer' },
  { name: 'HistorySearch', label: 'Searching your prompt history' },
  { name: 'Task', label: 'While a task runs in front' },
  { name: 'ThemePicker', label: 'The theme picker' },
  { name: 'Attachments', label: 'Picking an attached image' },
  { name: 'Footer', label: 'The items under the prompt' },
  { name: 'MessageSelector', label: 'Picking a message to rewind to' },
  { name: 'DiffDialog', label: 'The earlier diff viewer' },
  { name: 'DiffPanel', label: 'The diff panel' },
  { name: 'ModelPicker', label: 'The model picker' },
  { name: 'EffortSlider', label: 'The /effort slider' },
  { name: 'Select', label: 'Any list to pick from' },
  { name: 'Plugin', label: 'The plugin dialog' },
  { name: 'AbovePrompt', label: 'The band above the prompt' },
  { name: 'AbovePromptInput', label: 'A text box above the prompt' },
  { name: 'AbovePromptSelect', label: 'A choice above the prompt' },
  { name: 'Pane', label: 'A mod’s pane' },
  { name: 'PaneField', label: 'A box in a mod’s pane' },
  { name: 'Agents', label: 'Agent view (claude agents)' },
  { name: 'Scroll', label: 'Scrolling and selecting in fullscreen' }
]

const a = (context: string, action: string, label: string, ...defaults: string[]): KeybindingAction => ({ context, action, label, defaults })

/** Every action the keybindings docs list per context, with its built-in keys on Windows. */
export const KEYBINDING_ACTIONS: readonly KeybindingAction[] = [
  a('Global', 'app:interrupt', 'Cancel what is running', 'ctrl+c'),
  a('Global', 'app:exit', 'Exit Claude Code (press twice)', 'ctrl+d'),
  a('Global', 'app:redraw', 'Redraw the terminal'),
  a('Global', 'app:toggleTodos', 'Show or hide Claude’s to-do list', 'ctrl+t'),
  a('Global', 'app:toggleTranscript', 'Show or hide the full transcript', 'ctrl+o'),
  a('Global', 'app:toggleReplTab', 'Open or close the earlier diff panel'),
  a('Global', 'app:diffFileListUp', 'Scroll the diff panel’s file list up', 'ctrl+up', 'alt+up'),
  a('Global', 'app:diffFileListDown', 'Scroll the diff panel’s file list down', 'ctrl+down', 'alt+down'),
  a('Global', 'app:toggleDiffNoiseFilter', 'Show or hide test and generated files in the earlier diff panel'),
  a('Global', 'app:toggleDiffPreSession', 'Expand or collapse changes from before this chat in the earlier diff panel'),
  a('Global', 'pane:next', 'Show the next open pane'),
  a('Global', 'pane:previous', 'Show the previous open pane'),
  a('Chat', 'history:search', 'Search your prompt history', 'ctrl+r'),
  a('Chat', 'history:previous', 'Previous prompt from history', 'up'),
  a('Chat', 'history:next', 'Next prompt from history', 'down'),
  a('Chat', 'chat:cancel', 'Cancel what you are typing', 'escape'),
  a('Chat', 'chat:clearInput', 'Redraw the screen, keeping your prompt', 'ctrl+l'),
  a('Chat', 'chat:clearScreen', 'Same as redraw the screen', 'cmd+k'),
  a('Chat', 'chat:killAgents', 'Stop every background subagent (press twice)', 'ctrl+x ctrl+k'),
  a('Chat', 'chat:cycleMode', 'Switch permission mode', 'shift+tab'),
  a('Chat', 'chat:modelPicker', 'Open the model picker', 'alt+p'),
  a('Chat', 'chat:fastMode', 'Turn fast mode on or off', 'alt+o'),
  a('Chat', 'chat:thinkingToggle', 'Turn extended thinking on or off', 'alt+t'),
  a('Chat', 'chat:submit', 'Send the prompt', 'enter'),
  a('Chat', 'chat:queueSubmit', 'Send the prompt to wait its turn', 'ctrl+x enter'),
  a('Chat', 'chat:sendNow', 'Send queued prompts right away', 'ctrl+enter', 'ctrl+x ctrl+s'),
  a('Chat', 'chat:newline', 'New line without sending', 'ctrl+j'),
  a('Chat', 'chat:undo', 'Undo', 'ctrl+_', 'ctrl+shift+-'),
  a('Chat', 'chat:externalEditor', 'Edit the prompt in your editor', 'ctrl+g', 'ctrl+x ctrl+e'),
  a('Chat', 'chat:stash', 'Put the prompt aside', 'ctrl+s'),
  a('Chat', 'chat:imagePaste', 'Paste an image', 'alt+v'),
  a('Chat', 'voice:pushToTalk', 'Dictate a prompt, with voice on', 'space'),
  a('Chat', 'abovePrompt:toggle', 'Fold or unfold the band above the prompt', 'ctrl+x ctrl+a'),
  a('Chat', 'abovePrompt:focus', 'Move into the band above the prompt and the panes', 'ctrl+x tab'),
  a('Autocomplete', 'autocomplete:accept', 'Take the suggestion', 'tab'),
  a('Autocomplete', 'autocomplete:dismiss', 'Close the menu', 'escape'),
  a('Autocomplete', 'autocomplete:previous', 'Previous suggestion', 'up'),
  a('Autocomplete', 'autocomplete:next', 'Next suggestion', 'down'),
  a('Settings', 'settings:search', 'Search', '/'),
  a('Settings', 'settings:retry', 'Load usage again after an error', 'r'),
  a('Settings', 'settings:fixUsage', 'Apply the /usage recommendations', 'f'),
  a('Settings', 'select:accept', 'Change the setting or open it', 'enter', 'space'),
  a('Settings', 'confirm:no', 'Close the panel (changes are kept)', 'escape'),
  a('Confirmation', 'confirm:yes', 'Confirm', 'enter'),
  a('Confirmation', 'confirm:no', 'Decline', 'escape'),
  a('Confirmation', 'confirm:previous', 'Previous option', 'up'),
  a('Confirmation', 'confirm:next', 'Next option', 'down'),
  a('Confirmation', 'confirm:nextField', 'Turn fast mode on or off in /fast', 'tab'),
  a('Confirmation', 'confirm:previousField', 'Nothing (kept so old files stay valid)'),
  a('Confirmation', 'confirm:toggle', 'Tick or untick', 'space'),
  a('Confirmation', 'confirm:cycleMode', 'Allow for the rest of the chat, or close a comment', 'shift+tab'),
  a('Confirmation', 'permission:toggleDebug', 'Nothing (kept so old files stay valid)'),
  a('Tabs', 'tabs:next', 'Next tab', 'tab', 'right'),
  a('Tabs', 'tabs:previous', 'Previous tab', 'shift+tab', 'left'),
  a('Help', 'help:dismiss', 'Close the help menu', 'escape'),
  a('Transcript', 'transcript:toggleShowAll', 'Show everything or less', 'ctrl+e'),
  a('Transcript', 'transcript:exit', 'Leave the transcript', 'q', 'ctrl+c', 'escape'),
  a('HistorySearch', 'historySearch:next', 'Next match', 'ctrl+r'),
  a('HistorySearch', 'historySearch:accept', 'Take the match', 'escape', 'tab'),
  a('HistorySearch', 'historySearch:cancel', 'Cancel the search', 'ctrl+c'),
  a('HistorySearch', 'historySearch:execute', 'Run the match', 'enter'),
  a('HistorySearch', 'historySearch:cycleScope', 'Search this chat, this project or everywhere', 'ctrl+s'),
  a('Task', 'task:background', 'Send the task to the background', 'ctrl+b', 'ctrl+x ctrl+b'),
  a('ThemePicker', 'theme:toggleSyntaxHighlighting', 'Turn syntax colours on or off', 'ctrl+t'),
  a('Attachments', 'attachments:next', 'Next attachment', 'right'),
  a('Attachments', 'attachments:previous', 'Previous attachment', 'left'),
  a('Attachments', 'attachments:remove', 'Remove the attachment', 'backspace', 'delete'),
  a('Attachments', 'attachments:exit', 'Leave the attachments', 'down', 'escape'),
  a('Footer', 'footer:next', 'Next item', 'right'),
  a('Footer', 'footer:previous', 'Previous item', 'left'),
  a('Footer', 'footer:up', 'Up (leaves at the top)', 'up', 'ctrl+p'),
  a('Footer', 'footer:down', 'Down', 'down', 'ctrl+n'),
  a('Footer', 'footer:openSelected', 'Open the item', 'enter'),
  a('Footer', 'footer:clearSelection', 'Leave the items', 'escape'),
  a('Footer', 'footer:close', 'Stop the agent or workflow, or dismiss its row', 'x'),
  a('Footer', 'footer:dismiss', 'Nothing (kept so old files stay valid)'),
  a('DiffDialog', 'diff:dismiss', 'Close, or back to the file list', 'escape'),
  a('DiffDialog', 'diff:previousSource', 'Previous source', 'left'),
  a('DiffDialog', 'diff:nextSource', 'Next source', 'right'),
  a('DiffDialog', 'diff:previousFile', 'Previous file, or a line up', 'up', 'k'),
  a('DiffDialog', 'diff:nextFile', 'Next file, or a line down', 'down', 'j'),
  a('DiffDialog', 'diff:back', 'Back'),
  a('DiffDialog', 'scroll:pageUp', 'Half a screen up', 'pageup'),
  a('DiffDialog', 'scroll:pageDown', 'Half a screen down', 'pagedown'),
  a('DiffDialog', 'scroll:fullPageUp', 'A screen up', 'shift+space', 'b'),
  a('DiffDialog', 'scroll:fullPageDown', 'A screen down', 'space'),
  a('DiffDialog', 'scroll:top', 'To the top', 'g', 'home'),
  a('DiffDialog', 'scroll:bottom', 'To the bottom', 'shift+g', 'end'),
  a('DiffPanel', 'app:cycleDiffBase', 'Compare with this chat, uncommitted or the branch', 'ctrl+x b'),
  a('ModelPicker', 'modelPicker:decreaseEffort', 'Less effort', 'left'),
  a('ModelPicker', 'modelPicker:increaseEffort', 'More effort', 'right'),
  a('ModelPicker', 'modelPicker:thisSessionOnly', 'Use the model in this chat only', 's'),
  a('EffortSlider', 'effortSlider:decreaseEffort', 'Less effort', 'left'),
  a('EffortSlider', 'effortSlider:increaseEffort', 'More effort', 'right'),
  a('EffortSlider', 'effortSlider:toggleUltracode', 'Turn ultracode on or off for this chat', 'tab'),
  a('EffortSlider', 'effortSlider:thisSessionOnly', 'Use the effort in this chat only', 's'),
  a('Select', 'select:next', 'Next option', 'down', 'j', 'ctrl+n'),
  a('Select', 'select:previous', 'Previous option', 'up', 'k', 'ctrl+p'),
  a('Select', 'select:pageUp', 'A page of options up', 'pageup'),
  a('Select', 'select:pageDown', 'A page of options down', 'pagedown'),
  a('Select', 'select:first', 'First option', 'home'),
  a('Select', 'select:last', 'Last option', 'end'),
  a('Select', 'select:accept', 'Pick the option', 'enter'),
  a('Select', 'select:cancel', 'Cancel', 'escape'),
  a('Plugin', 'plugin:toggle', 'Tick or untick the plugin', 'space'),
  a('Plugin', 'plugin:install', 'Install the ticked plugins', 'i'),
  a('Plugin', 'plugin:favorite', 'Favourite the plugin', 'f'),
  a('AbovePrompt', 'abovePrompt:next', 'Next control', 'tab'),
  a('AbovePrompt', 'abovePrompt:previous', 'Previous control', 'shift+tab'),
  a('AbovePrompt', 'abovePrompt:press', 'Press, send or pick', 'enter'),
  a('AbovePrompt', 'abovePrompt:leave', 'Back to the prompt', 'escape'),
  a('AbovePromptSelect', 'abovePrompt:highlightNext', 'Highlight the next option', 'down'),
  a('AbovePromptSelect', 'abovePrompt:highlightPrevious', 'Highlight the previous option', 'up'),
  a('Pane', 'pane:scrollUp', 'Scroll up', 'up'),
  a('Pane', 'pane:scrollDown', 'Scroll down', 'down'),
  a('Pane', 'pane:pageUp', 'A page up', 'pageup'),
  a('Pane', 'pane:pageDown', 'A page down', 'pagedown'),
  a('Pane', 'pane:top', 'To the top', 'home'),
  a('Pane', 'pane:bottom', 'To the bottom', 'end'),
  a('Pane', 'pane:grow', 'Give the pane more room', 'ctrl+x left', 'ctrl+x up'),
  a('Pane', 'pane:shrink', 'Give the pane less room', 'ctrl+x right', 'ctrl+x down'),
  a('Pane', 'pane:close', 'Close the pane', 'ctrl+x x'),
  a('PaneField', 'pane:close', 'Close the pane', 'ctrl+x x'),
  a('Agents', 'agents:switchView', 'Group by state or by folder', 'ctrl+s'),
  a('Agents', 'agents:togglePin', 'Pin or unpin the chat', 'ctrl+t'),
  a('Agents', 'agents:find', 'Find chats by name', 'ctrl+f'),
  a('Agents', 'agents:rename', 'Rename the chat', 'ctrl+r'),
  a('Agents', 'agents:previousGroup', 'Previous group', 'ctrl+up', 'alt+up'),
  a('Agents', 'agents:nextGroup', 'Next group', 'ctrl+down', 'alt+down'),
  a('Scroll', 'scroll:lineUp', 'A line up', 'wheelup'),
  a('Scroll', 'scroll:lineDown', 'A line down', 'wheeldown'),
  a('Scroll', 'scroll:pageUp', 'Half a screen up', 'pageup'),
  a('Scroll', 'scroll:pageDown', 'Half a screen down', 'pagedown'),
  a('Scroll', 'scroll:top', 'To the start of the chat', 'ctrl+home'),
  a('Scroll', 'scroll:bottom', 'To the latest message', 'ctrl+end'),
  a('Scroll', 'scroll:halfPageUp', 'Half a screen up (for vi-style keys)'),
  a('Scroll', 'scroll:halfPageDown', 'Half a screen down (for vi-style keys)'),
  a('Scroll', 'scroll:fullPageUp', 'A screen up'),
  a('Scroll', 'scroll:fullPageDown', 'A screen down'),
  a('Scroll', 'selection:copy', 'Copy the selection', 'ctrl+shift+c', 'cmd+c'),
  a('Scroll', 'selection:clear', 'Clear the selection'),
  a('Scroll', 'selection:extendLeft', 'Grow the selection left', 'shift+left'),
  a('Scroll', 'selection:extendRight', 'Grow the selection right', 'shift+right'),
  a('Scroll', 'selection:extendUp', 'Grow the selection up', 'shift+up'),
  a('Scroll', 'selection:extendDown', 'Grow the selection down', 'shift+down'),
  a('Scroll', 'selection:extendLineStart', 'Grow the selection to the line start', 'shift+home'),
  a('Scroll', 'selection:extendLineEnd', 'Grow the selection to the line end', 'shift+end')
]

const MODIFIERS = ['ctrl', 'shift', 'alt', 'cmd'] as const

const MODIFIER_NAMES: Record<string, (typeof MODIFIERS)[number]> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  opt: 'alt',
  option: 'alt',
  meta: 'alt',
  cmd: 'cmd',
  command: 'cmd',
  super: 'cmd',
  win: 'cmd'
}

const KEY_NAMES: Record<string, string> = { esc: 'escape', return: 'enter' }

/** One keystroke as `ctrl+shift+k`: modifiers in a fixed order under one name each, then the key, lower case. */
function normalStroke(stroke: string): string {
  const lower = stroke.toLowerCase()
  const parts = lower.endsWith('++') ? [...lower.slice(0, -2).split('+'), '+'] : lower.split('+')
  const key = parts.pop() ?? ''
  const mods = new Set(parts.map((part) => MODIFIER_NAMES[part] ?? part))
  const known = MODIFIERS.filter((m) => mods.has(m))
  const unknown = [...mods].filter((m) => !(MODIFIERS as readonly string[]).includes(m))
  return [...known, ...unknown, KEY_NAMES[key] ?? key].join('+')
}

/** A binding as Claude Code reads it, spelled one way, so two spellings of the same keys compare equal. */
export const normalBinding = (binding: string): string => binding.trim().split(/\s+/).map(normalStroke).join(' ')

export const sameBinding = (a: string, b: string): boolean => normalBinding(a) === normalBinding(b)

const LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  cmd: 'Win',
  escape: 'Esc',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  capslock: 'Caps Lock',
  wheelup: 'Wheel up',
  wheeldown: 'Wheel down'
}

const partLabel = (part: string): string => LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1))

/** A binding as a person reads it: `Ctrl+K Ctrl+S`. */
export const bindingLabel = (binding: string): string =>
  normalBinding(binding)
    .split(' ')
    .map((stroke) => {
      const key = stroke.endsWith('++') ? '+' : stroke.slice(stroke.lastIndexOf('+') + 1)
      const mods = stroke.endsWith('++') ? stroke.slice(0, -2) : stroke.slice(0, Math.max(0, stroke.lastIndexOf('+')))
      return [...(mods ? mods.split('+') : []), key].map(partLabel).join('+')
    })
    .join(' ')

const RESERVED: Record<string, string> = {
  'ctrl+c': 'Ctrl+C always cancels or interrupts',
  'ctrl+d': 'Ctrl+D always exits',
  'ctrl+m': 'Claude Code always reads Ctrl+M as Enter',
  'ctrl+[': 'Claude Code always reads Ctrl+[ as Escape',
  'ctrl+i': 'Claude Code always reads Ctrl+I as Tab',
  'ctrl+h': 'Ctrl+H reaches Claude Code as Backspace',
  capslock: 'Caps Lock never reaches a terminal program'
}

/** Why Claude Code can't take the binding, or null when it can. */
export function reservedReason(binding: string): string | null {
  for (const stroke of normalBinding(binding).split(' ')) if (RESERVED[stroke]) return RESERVED[stroke]
  return null
}

/** The parts of a key event that make a keystroke. */
export interface KeyPress {
  key: string
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

const CODE_KEYS: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Space: 'space'
}

const NAMED_KEYS: Record<string, string> = {
  Escape: 'escape',
  Enter: 'enter',
  Tab: 'tab',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Home: 'home',
  End: 'end',
  Backspace: 'backspace',
  Delete: 'delete',
  CapsLock: 'capslock'
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS'])

/** The key's own name, from where it sits so Shift or Alt don't change it; null for a modifier pressed alone. */
function keyName({ key, code }: KeyPress): string | null {
  if (MODIFIER_KEYS.has(key)) return null
  if (NAMED_KEYS[key]) return NAMED_KEYS[key]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (CODE_KEYS[code]) return CODE_KEYS[code]
  if (/^F\d{1,2}$/.test(key)) return key.toLowerCase()
  return key === ' ' ? 'space' : key.length === 1 ? key.toLowerCase() : null
}

/** One key press as binding text, such as `ctrl+k`; null while only modifiers are down. */
export function keystrokeText(press: KeyPress): string | null {
  const key = keyName(press)
  if (key === null) return null
  const mods = [press.ctrlKey && 'ctrl', press.shiftKey && 'shift', press.altKey && 'alt', press.metaKey && 'cmd'].filter(Boolean)
  return [...mods, key].join('+')
}

export const keybindingAction = (context: string, action: string): KeybindingAction | undefined => KEYBINDING_ACTIONS.find((a) => a.context === context && a.action === action)

/** The keys of one context in the file, as written: an action, null to unbind, or something else Claude would refuse. */
export type ContextKeys = Record<string, unknown>

/** A change to one key of the file; undefined takes the key out. */
export interface KeyEdit {
  path: string
  value: unknown
}

/** The file's own spelling of the binding in the context, if it has one. */
const fileKey = (keys: ContextKeys | undefined, binding: string): string | undefined => Object.keys(keys ?? {}).find((key) => sameBinding(key, binding))

/** The action a binding runs in the context when the file says nothing about it. */
const defaultAction = (context: string, binding: string): string | undefined => KEYBINDING_ACTIONS.find((a) => a.context === context && a.defaults.includes(normalBinding(binding)))?.action

export interface ShownKey {
  binding: string
  /** Added by the file rather than built in. */
  fromFile: boolean
}

/** The keys that run the action now: its built-in keys the file doesn't take away, then the keys the file gives it. */
export function actionKeys(entry: KeybindingAction, keys: ContextKeys | undefined): ShownKey[] {
  const builtIn = entry.defaults.filter((binding) => {
    const key = fileKey(keys, binding)
    return key === undefined || keys?.[key] === entry.action
  })
  const added = Object.entries(keys ?? {})
    .filter(([key, value]) => value === entry.action && !entry.defaults.includes(normalBinding(key)))
    .map(([key]) => normalBinding(key))
  return [...builtIn.map((binding) => ({ binding, fromFile: false })), ...added.map((binding) => ({ binding, fromFile: true }))]
}

/** Whether the file changes which keys run the action. */
export const actionChanged = (entry: KeybindingAction, keys: ContextKeys | undefined): boolean => resetEdits(entry, keys).length > 0

const edit = (context: string, key: string, value: unknown): KeyEdit => ({
  path: keyPath('bindings', context, key),
  value
})

/** The binding runs the action: a built-in key of it loses the file's entry, any other key gets one. */
export function addKeyEdits(entry: KeybindingAction, keys: ContextKeys | undefined, binding: string): KeyEdit[] {
  const key = fileKey(keys, binding)
  if (defaultAction(entry.context, binding) === entry.action) return key === undefined ? [] : [edit(entry.context, key, undefined)]
  return [edit(entry.context, key ?? normalBinding(binding), entry.action)]
}

/** The binding no longer runs anything: null over a built-in key, else the file's entry goes. */
export function unbindEdits(entry: KeybindingAction, keys: ContextKeys | undefined, binding: string): KeyEdit[] {
  const key = fileKey(keys, binding)
  if (defaultAction(entry.context, binding) !== undefined) return [edit(entry.context, key ?? normalBinding(binding), null)]
  return key === undefined ? [] : [edit(entry.context, key, undefined)]
}

/** Takes out every entry of the file on the action's built-in keys or giving it a key, so its built-in keys apply again. */
export function resetEdits(entry: KeybindingAction, keys: ContextKeys | undefined): KeyEdit[] {
  return Object.entries(keys ?? {})
    .filter(([key, value]) => value === entry.action || entry.defaults.includes(normalBinding(key)))
    .map(([key]) => edit(entry.context, key, undefined))
}

/** The action a binding runs in the context now, for a key taken from another action. */
export function boundAction(context: string, keys: ContextKeys | undefined, binding: string): string | null {
  const key = fileKey(keys, binding)
  if (key !== undefined) return typeof keys?.[key] === 'string' ? (keys[key] as string) : null
  return defaultAction(context, binding) ?? null
}

export interface OtherBinding {
  context: string
  key: string
  value: unknown
}

/** The file's entries no action row shows: an unknown context, an action not listed for its context, a command, or null on a key with nothing built in. */
export function otherBindings(bindings: Record<string, unknown> | undefined): OtherBinding[] {
  return Object.entries(bindings ?? {}).flatMap(([context, keys]) => {
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return [{ context, key: '', value: keys }]
    return Object.entries(keys)
      .filter(([key, value]) => !(typeof value === 'string' && keybindingAction(context, value)) && !(value === null && defaultAction(context, key) !== undefined))
      .map(([key, value]) => ({ context, key, value }))
  })
}

/** What a value of the file runs, in words. */
export function actionWords(context: string, value: unknown): string {
  if (value === null) return 'nothing (unbound)'
  if (typeof value !== 'string') return JSON.stringify(value)
  if (value.startsWith('command:')) return `the command /${value.slice('command:'.length)}`
  return keybindingAction(context, value)?.label ?? value
}

/** A change to `bindings.<context>.<key>` as Review and the conflict question name it. */
export function keyEditWords(path: string): {
  label: string
  format: (value: unknown) => string
} {
  const [, context = '', key] = pathKeys(path)
  const where = KEYBINDING_CONTEXTS.find((c) => c.name === context)?.label ?? context
  return {
    label: key === undefined ? where : `${where} · ${bindingLabel(key)}`,
    format: (value) => {
      if (value !== undefined) return actionWords(context, value)
      const builtIn = key === undefined ? undefined : defaultAction(context, key)
      return builtIn ? `${actionWords(context, builtIn)} (built in)` : 'no action'
    }
  }
}
