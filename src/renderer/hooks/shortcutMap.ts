import { APP_VIEWS, type AppView } from '../../shared/views'
import type { ZoomStep } from '../../shared/zoom'

export type KeyChord = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

interface PlainShortcut {
  name:
    | 'openSettings'
    | 'newChat'
    | 'closeActiveChat'
    | 'focusInput'
    | 'toggleIdePanels'
    | 'toggleSessionList'
    | 'toggleShellDrawer'
    | 'nextWaiting'
    | 'loadPastSession'
}

export type ShortcutAction =
  | { name: 'switchView'; view: AppView }
  | { name: 'selectRow'; index: number }
  | { name: 'zoom'; step: ZoomStep }
  | PlainShortcut

const CTRL_LETTERS: Record<string, PlainShortcut['name']> = {
  t: 'newChat',
  w: 'closeActiveChat',
  k: 'focusInput',
  b: 'toggleSessionList',
  l: 'loadPastSession'
}

/** Ctrl+J is the prompt box's newline, as in the VS Code extension. */
const CTRL_SHIFT_LETTERS: Record<string, PlainShortcut['name']> = {
  j: 'nextWaiting',
  e: 'toggleIdePanels'
}

/** By the printed key, since Nordic layouts put + on the Minus key; Ctrl+0 also by position, for layouts where that key types another character. */
function zoomStepFor(e: KeyChord): ZoomStep | null {
  if (e.key === '=' || e.key === '+') return 'in'
  if (e.key === '-') return 'out'
  if (e.key === '0' || (e.code === 'Digit0' && !e.shiftKey)) return 'reset'
  return null
}

export function shortcutFor(e: KeyChord): ShortcutAction | null {
  const digit = /^Digit([1-9])$/.exec(e.code)?.[1]
  const mod = e.ctrlKey || e.metaKey

  // AltGr arrives as Ctrl+Alt and types characters on some layouts, so only a bare Alt counts.
  if (digit && e.altKey && !mod) return { name: 'selectRow', index: Number(digit) - 1 }
  if (!mod) return null

  const zoom = e.altKey ? null : zoomStepFor(e)
  if (zoom) return { name: 'zoom', step: zoom }
  if (digit) {
    const view = e.altKey ? undefined : APP_VIEWS[Number(digit) - 1]
    return view ? { name: 'switchView', view } : null
  }
  // By position: on Nordic and German layouts these keys don't type a backtick or a comma.
  if (e.code === 'Backquote') return { name: 'toggleShellDrawer' }
  if (e.code === 'Comma' || e.key === ',') return { name: 'openSettings' }

  const letter = (e.shiftKey ? CTRL_SHIFT_LETTERS : CTRL_LETTERS)[e.key.toLowerCase()]
  return letter ? { name: letter } : null
}

const EVERYWHERE: ReadonlySet<ShortcutAction['name']> = new Set(['switchView', 'openSettings', 'nextWaiting', 'zoom'])

const BEFORE_FOCUSED: ReadonlySet<ShortcutAction['name']> = new Set(['zoom', 'toggleSessionList'])

/** Taken before a focused shell or prompt box sees the key, as VS Code's terminal skips these commands; the rest leave a shell its keys. */
export function beforeFocusedElement(action: ShortcutAction): boolean {
  return BEFORE_FOCUSED.has(action.name)
}

export interface ScreenState {
  view: AppView
  settingsOpen: boolean
}

/** The chat, row, session list, IDE and shell shortcuts act only while Work is on screen. */
export function shortcutApplies(action: ShortcutAction, screen: ScreenState): boolean {
  return EVERYWHERE.has(action.name) || (screen.view === 'work' && !screen.settingsOpen)
}
