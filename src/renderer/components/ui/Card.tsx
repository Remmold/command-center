import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  tooltip?: string
  onClick?: () => void
  selected?: boolean
  muted?: boolean
  /** DOM id, so the card can be scrolled into view. */
  anchorId?: string
}

const BASE = 'flex shrink-0 flex-col gap-1.5 rounded-md border p-2.5 text-left'

function look(selected: boolean, muted: boolean): string {
  if (muted) return 'border-dashed border-subtle bg-transparent text-muted'
  if (selected) return 'border-focus bg-list-selected ring-1 ring-focus'
  return 'border-subtle bg-sidebar'
}

export function Card({ children, tooltip, onClick, selected = false, muted = false, anchorId }: CardProps) {
  const className = `${BASE} ${look(selected, muted)}`
  if (!onClick) {
    return (
      <div id={anchorId} title={tooltip} className={className}>
        {children}
      </div>
    )
  }
  return (
    <button
      id={anchorId}
      type="button"
      title={tooltip}
      onClick={onClick}
      aria-pressed={selected}
      className={`${className} w-full min-w-0 hover:border-muted focus-visible:border-focus focus-visible:outline-none`}
    >
      {children}
    </button>
  )
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted">{children}</div>
}

/** Secondary prose under a card's title, cut to two lines. */
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="line-clamp-2 text-[10px] leading-4 text-muted">{children}</p>
}

export function CardTitle({ children, prefix }: { children: ReactNode; prefix?: string }) {
  return (
    <div className="line-clamp-3 text-xs leading-snug text-fg">
      {prefix && <span className="mr-1 tabular-nums text-muted">{prefix}</span>}
      {children}
    </div>
  )
}
