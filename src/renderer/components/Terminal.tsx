import { useEffect, useRef } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { TerminalInfo } from '../../shared/types'
import { registerTerminalReader } from '../state/terminalBuffers'
import { useTerminalsStore } from '../state/terminalsStore'
import { openXterm } from './xterm'

/** The extension's `getTerminalContents` limit. */
const TERMINAL_MENTION_LINES = 100

function bufferText(term: XTerm): string {
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-TERMINAL_MENTION_LINES).join('\n')
}

function exitNotice(t: TerminalInfo): string {
  const how = t.exitCode === undefined ? 'stopped' : `exited (${t.exitCode})`
  return `\r\n\x1b[2m${t.command ?? t.kind} ${how}\x1b[0m\r\n`
}

interface Props {
  /** A terminal in main's pool; this view attaches to it and never ends it (ADR 0006). */
  terminalId: string
}

export function Terminal({ terminalId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let alive = true
    /** The run this view shows, by its start time; null until attached. */
    let shown: TerminalInfo | null = null
    const xterm = openXterm(container, {
      onFit: (cols, rows) => {
        if (shown) window.api.terminals.resize(terminalId, cols, rows)
      }
    })
    const term = xterm.term
    const unregister = registerTerminalReader(terminalId, () => bufferText(term))
    let unsubData = (): void => undefined

    const follow = (t: TerminalInfo | undefined): void => {
      // The store may still hold the run before the one attached to.
      if (!shown || !t || t.startedAt < shown.startedAt) return
      if (t.startedAt !== shown.startedAt) term.reset()
      else if (shown.status === 'running' && t.status === 'exited') term.write(exitNotice(t))
      shown = t
    }
    const unsubStore = useTerminalsStore.subscribe((s) => follow(s.byId[terminalId]))

    // Data sent after the attach reply is new; what came before is in the tail.
    void window.api.terminals.attach(terminalId).then((attached) => {
      if (!alive || !attached) return
      shown = attached.terminal
      term.write(attached.tail)
      if (shown.status === 'exited') term.write(exitNotice(shown))
      unsubData = window.api.terminals.onData((event) => {
        if (event.id === terminalId) term.write(event.data)
      })
      follow(useTerminalsStore.getState().byId[terminalId])
      window.api.terminals.resize(terminalId, term.cols, term.rows)
    })

    const dataDisposable = term.onData((data) => {
      if (shown?.status === 'running') window.api.terminals.write(terminalId, data)
    })

    return () => {
      alive = false
      unregister()
      dataDisposable.dispose()
      unsubData()
      unsubStore()
      xterm.dispose()
    }
  }, [terminalId])

  return <div ref={containerRef} className="h-full w-full bg-editor" />
}
