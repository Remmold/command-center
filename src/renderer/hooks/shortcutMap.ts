import { APP_VIEWS, type AppView } from '../../shared/views'

export type KeyChord = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>

interface PlainShortcut {
  name:
    | 'openSettings'
    | 'newChat'
    | 'closeActiveChat'
    | 'focusInput'
    | 'toggleIdePanels'
    | 'toggleShellDrawer'
    | 'nextWaiting'
    | 'loadPastSession'
}

export type ShortcutAction =
  | { name: 'switchView'; view: AppView }
  | { name: 'selectRow'; index: number }
  | PlainShortcut

const CTRL_LETTERS: Record<string, PlainShortcut['name']> = {
  t: 'newChat',
  w: 'closeActiveChat',
  k: 'focusInput',
  b: 'toggleIdePanels',
  j: 'nextWaiting',
  l: 'loadPastSession'
}

export function shortcutFor(e: KeyChord): ShortcutAction | null {
  const digit = /^Digit([1-9])$/.exec(e.code)?.[1]
  const mod = e.ctrlKey || e.metaKey

  // AltGr arrives as Ctrl+Alt and types characters on some layouts, so only a bare Alt counts.
  if (digit && e.altKey && !mod) return { name: 'selectRow', index: Number(digit) - 1 }
  if (!mod) return null

  if (digit) {
    const view = e.altKey ? undefined : APP_VIEWS[Number(digit) - 1]
    return view ? { name: 'switchView', view } : null
  }
  // By position: on Nordic and German layouts these keys don't type a backtick or a comma.
  if (e.code === 'Backquote') return { name: 'toggleShellDrawer' }
  if (e.code === 'Comma' || e.key === ',') return { name: 'openSettings' }

  const letter = CTRL_LETTERS[e.key]
  return letter ? { name: letter } : null
}

const EVERYWHERE: ReadonlySet<ShortcutAction['name']> = new Set(['switchView', 'openSettings', 'nextWaiting'])

export interface ScreenState {
  view: AppView
  settingsOpen: boolean
}

/** The chat, row, IDE and shell shortcuts act only while Work is on screen. */
export function shortcutApplies(action: ShortcutAction, screen: ScreenState): boolean {
  return EVERYWHERE.has(action.name) || (screen.view === 'work' && !screen.settingsOpen)
}
