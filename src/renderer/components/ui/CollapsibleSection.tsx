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
  /** `pane` heads a side bar block; `group` is a lighter sub-header nested inside one. */
  level?: 'pane' | 'group'
  children: ReactNode
}

const LEVEL = {
  pane: { section: '', button: 'gap-1 px-1 font-bold text-fg' },
  group: { section: 'pt-1.5', button: 'gap-1.5 px-3 font-medium text-muted' }
} as const

/** A foldable block of a side bar, headed like a VS Code view pane. */
export function CollapsibleSection({ title, open, onToggle, badge, tooltip, marker, level = 'pane', children }: Props) {
  const look = LEVEL[level]
  return (
    <section aria-label={title} className={look.section || undefined}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        title={tooltip}
        className={`flex h-[22px] w-full min-w-0 items-center text-left text-[11px] hover:bg-list-hover focus-visible:bg-list-hover focus-visible:outline-none ${look.button}`}
      >
        {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
        {marker}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {badge}
      </button>
      {open && children}
    </section>
  )
}
