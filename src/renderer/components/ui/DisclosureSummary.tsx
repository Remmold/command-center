import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Without `onToggle` it is a plain line that does not expand. */
  open?: boolean
  onToggle?: () => void
}

/** A muted one-line summary that expands what follows it, with a chevron that turns when open. */
export function DisclosureSummary({ children, open = false, onToggle }: Props) {
  const look = 'inline-flex items-center gap-1 rounded px-1.5 text-[13px] text-muted opacity-80'
  if (!onToggle) return <div className={look}>{children}</div>
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`${look} hover:opacity-100 aria-expanded:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus`}
    >
      {children}
      <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
    </button>
  )
}
