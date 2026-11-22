import { useState } from 'react'
import { Markdown } from '../ui/Markdown'
import { DisclosureSummary } from '../ui/DisclosureSummary'
import { TimelineRow } from '../ui/Timeline'
import { thinkingLabel, thinkingTokensLabel } from './thinking'

interface Props {
  text: string
  streaming: boolean
  durationMs: number | undefined
  /** The CLI's running estimate while the block streams. */
  tokens?: number
}

/** A thinking block as the extension draws it: a summary line that expands to the text, or a plain line when the text is hidden. */
export function ThinkingBlock({ text, streaming, durationMs, tokens }: Props) {
  const [open, setOpen] = useState(false)
  const estimate = streaming ? thinkingTokensLabel(tokens) : null
  const expandable = text.trim() !== ''
  return (
    <TimelineRow dot="neutral">
      <div data-thinking="" className="-ml-1.5">
        <DisclosureSummary open={open} onToggle={expandable ? () => setOpen((o) => !o) : undefined}>
          <span>{thinkingLabel({ streaming, durationMs })}</span>
          {estimate && <span className="whitespace-nowrap tabular-nums">· {estimate}</span>}
        </DisclosureSummary>
        {expandable && open && (
          <div className="mt-1 px-1.5">
            <Markdown text={text} tone="muted" />
          </div>
        )}
      </div>
    </TimelineRow>
  )
}
