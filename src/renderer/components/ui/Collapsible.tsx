import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SectionLabel } from './SectionLabel'

interface Props {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function Collapsible({ title, count, open, onToggle, children }: Props) {
  return (
    <section aria-label={title} className="flex flex-col rounded-lg bg-zinc-900/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-2 text-left text-zinc-400 hover:text-zinc-200"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1">
          <SectionLabel>{title}</SectionLabel>
        </span>
        <span className="text-[10px] tabular-nums text-zinc-500">{count}</span>
      </button>
      {open && <div className="flex flex-col gap-1 px-2 pb-2">{children}</div>}
    </section>
  )
}
