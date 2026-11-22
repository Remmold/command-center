import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Markdown } from '../ui/Markdown'
import { TimelineRow } from '../ui/Timeline'
import { compactLabel } from './compaction'
import type { CompactMetadata } from './types'

/** The extension's compaction line: "Compacted chat · auto · 974k tokens freed", opening to the summary Claude continues from. */
export function CompactLine({ meta, summary }: { meta: CompactMetadata | undefined; summary: string | undefined }) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <TimelineRow dot="none">
      <div data-compaction="">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded text-[13px] italic text-muted opacity-80 hover:opacity-100 aria-expanded:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
        >
          <span>{compactLabel(meta)}</span>
          <Chevron size={12} />
        </button>
        {open && (
          <div className="mt-2">
            {summary ? <Markdown text={summary} tone="muted" /> : <p className="text-[13px] text-muted">Conversation was compacted to free up context.</p>}
          </div>
        )}
      </div>
    </TimelineRow>
  )
}
