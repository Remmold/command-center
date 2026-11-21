import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { PtyKind } from '../../shared/types'
import { monoFont, xtermTheme } from '../theme/theme'

interface Props {
  paneId: string
  kind: PtyKind
  cwd: string
  /** Read once at spawn; a pane's environment never changes after its shell starts. */
  env?: Record<string, string>
}

export function Terminal({ paneId, kind, cwd, env }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const envRef = useRef(env)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: monoFont(),
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: xtermTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      // container may not be measured yet
    }

    let alive = true
    let spawned = false

    const spawn = async () => {
      const res = await window.api.pty.spawn(paneId, kind, cwd, envRef.current)
      if (!alive) return
      if (!res.ok) {
        term.write(`\r\n\x1b[31m${res.error}\x1b[0m\r\n`)
        return
      }
      spawned = true
      try {
        window.api.pty.resize(paneId, term.cols, term.rows)
      } catch {
        // ignore
      }
    }
    void spawn()

    const unsubData = window.api.pty.onData((event) => {
      if (event.paneId === paneId) term.write(event.data)
    })
    const unsubExit = window.api.pty.onExit((event) => {
      if (event.paneId === paneId) {
        term.write(`\r\n\x1b[2m${kind} exited (${event.exitCode})\x1b[0m\r\n`)
        spawned = false
      }
    })

    const dataDisposable = term.onData((data) => {
      if (spawned) window.api.pty.write(paneId, data)
    })

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      try {
        fit.fit()
        if (spawned) window.api.pty.resize(paneId, term.cols, term.rows)
      } catch {
        // ignore
      }
    })
    ro.observe(container)

    return () => {
      alive = false
      ro.disconnect()
      dataDisposable.dispose()
      unsubData()
      unsubExit()
      term.dispose()
      // NOTE: we intentionally do not kill the pty here.
      // PTYs are owned by the projectViewsStore lifetime, not the Terminal component's.
      // This keeps sessions alive when switching projects.
    }
  }, [paneId, kind, cwd])

  return <div ref={containerRef} className="h-full w-full bg-editor" />
}
