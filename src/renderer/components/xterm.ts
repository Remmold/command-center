import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { monoFont, xtermTheme } from '../theme/theme'

interface Options {
  /** No cursor and no keyboard input, and `\n` alone starts a new line, for output that isn't from a pty. */
  readOnly?: boolean
  /** After each fit to a measured container. */
  onFit?: (cols: number, rows: number) => void
}

export interface OpenXterm {
  term: XTerm
  dispose: () => void
}

/** An xterm in the app's look, filling `container` and refitting as it resizes. */
export function openXterm(container: HTMLElement, { readOnly = false, onFit }: Options = {}): OpenXterm {
  const term = new XTerm({
    fontFamily: monoFont(),
    fontSize: 13,
    cursorBlink: !readOnly,
    allowProposedApi: true,
    theme: xtermTheme(),
    ...(readOnly ? { disableStdin: true, convertEol: true, cursorInactiveStyle: 'none' as const } : {})
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(container)
  try {
    fit.fit()
  } catch {
    // container may not be measured yet
  }
  const ro = new ResizeObserver(() => {
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    try {
      fit.fit()
      onFit?.(term.cols, term.rows)
    } catch {
      // ignore
    }
  })
  ro.observe(container)
  return {
    term,
    dispose: () => {
      ro.disconnect()
      term.dispose()
    }
  }
}
