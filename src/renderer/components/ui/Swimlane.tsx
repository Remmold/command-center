import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  label: string
  header: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** A collapsible band across the board's columns. */
export function Swimlane({ label, header, open, onToggle, children }: Props) {
  return (
    <section aria-label={label} className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-800 pb-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="min-w-0 flex-1">{header}</span>
      </button>
      {open && children}
    </section>
  )
}
