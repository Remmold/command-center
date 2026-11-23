import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  title: string
  open: boolean
  onToggle: () => void
  /** Shown after the title whether the section is open or not, e.g. a count badge. */
  badge?: ReactNode
  tooltip?: string
  /** Shown before the title, e.g. an account's colour. */
  marker?: ReactNode
  /** Part of the header under its title, shown whether the section is open or not. */
  detail?: ReactNode
  children: ReactNode
}

/** A foldable block of a side bar, headed like a VS Code view pane. */
export function CollapsibleSection({ title, open, onToggle, badge, tooltip, marker, detail, children }: Props) {
  return (
    <section aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        title={tooltip}
        className="flex h-[22px] w-full min-w-0 items-center gap-1 px-1 text-left text-[11px] font-bold text-fg hover:bg-list-hover focus-visible:bg-list-hover focus-visible:outline-none"
      >
        {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
        {marker}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {badge}
      </button>
      {detail}
      {open && children}
    </section>
  )
}
