import { useEffect, useRef } from 'react'
import { useBackgroundProcessesStore } from '../state/backgroundProcessesStore'
import { outputStep, type TaskOutput } from '../state/taskOutput'
import { openXterm } from './xterm'

interface Props {
  paneId: string
  taskId: string
  label?: string
  /** `fill` takes its container's height; `inline` is a fixed-height box inside a list. */
  size?: 'fill' | 'inline'
}

const SIZES: Record<NonNullable<Props['size']>, string> = {
  fill: 'h-full w-full',
  inline: 'h-48 w-full overflow-hidden rounded border border-subtle px-1.5 py-1'
}

/** A Claude background process's output in a read-only terminal, following what its session's fetches bring. */
export function ProcessOutputTerminal({ paneId, taskId, label = 'Process output', size = 'fill' }: Props) {
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

  return <div ref={containerRef} aria-label={label} className={`bg-editor ${SIZES[size]}`} />
}
