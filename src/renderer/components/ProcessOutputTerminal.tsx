import { useEffect, useRef } from 'react'
import { useBackgroundProcessesStore } from '../state/backgroundProcessesStore'
import { outputStep, type TaskOutput } from '../state/taskOutput'
import { openXterm } from './xterm'

interface Props {
  paneId: string
  taskId: string
}

/** A Claude background process's output in a read-only terminal, following what its session's fetches bring. */
export function ProcessOutputTerminal({ paneId, taskId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const xterm = openXterm(container, { readOnly: true })
    let written: TaskOutput | null = null
    const show = (next: TaskOutput | undefined): void => {
      if (!next || next === written) return
      const step = outputStep(written, next)
      if (step.kind === 'rewrite') xterm.term.reset()
      if (step.kind !== 'none') xterm.term.write(step.text)
      written = next
    }
    show(useBackgroundProcessesStore.getState().outputs[paneId]?.[taskId]?.raw)
    const unsubscribe = useBackgroundProcessesStore.subscribe((s) => show(s.outputs[paneId]?.[taskId]?.raw))
    return () => {
      unsubscribe()
      xterm.dispose()
    }
  }, [paneId, taskId])

  return <div ref={containerRef} aria-label="Process output" className="h-full w-full bg-editor" />
}
