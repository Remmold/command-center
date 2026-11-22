import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Markdown } from '../ui/Markdown'
import { thinkingLabel, thinkingTokensLabel } from './thinking'

interface Props {
  text: string
  streaming: boolean
  durationMs: number | undefined
  /** The CLI's running estimate while the block streams. */
  tokens?: number
}

/** A thinking block as the extension draws it: a muted summary line that expands to the text, or a plain line when the text is hidden. */
export function ThinkingBlock({ text, streaming, durationMs, tokens }: Props) {
  const [open, setOpen] = useState(false)
  const label = thinkingLabel({ streaming, durationMs })
  const estimate = streaming ? thinkingTokensLabel(tokens) : null
  const summary = (
    <>
      <span>{label}</span>
      {estimate && <span className="whitespace-nowrap tabular-nums">· {estimate}</span>}
    </>
  )
  if (!text.trim()) {
    return (
      <div data-thinking="" className="inline-flex items-center gap-1 px-1.5 text-[13px] text-muted opacity-80">
        {summary}
      </div>
    )
  }
  return (
    <div data-thinking="">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded px-1.5 text-[13px] text-muted opacity-80 hover:opacity-100 aria-expanded:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
      >
        {summary}
        <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 px-1.5">
          <Markdown text={text} tone="muted" />
        </div>
      )}
    </div>
  )
}
