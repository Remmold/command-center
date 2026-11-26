import type { ReactNode } from 'react'

export type TerminalFrameSize = 'fill' | 'inline'

const SIZES: Record<TerminalFrameSize, string> = {
  fill: 'h-full w-full',
  inline: 'h-48 w-full overflow-hidden rounded border border-subtle px-1.5 py-1'
}

/** The editor-coloured box a terminal draws in: `fill` takes its container's height, `inline` is a fixed-height box inside a list. */
export function TerminalFrame({ size = 'fill', children }: { size?: TerminalFrameSize; children: ReactNode }) {
  return <div className={`bg-editor ${SIZES[size]}`}>{children}</div>
}
