import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  tooltip?: string
  onClick?: () => void
  selected?: boolean
  /** A placeholder: dashed and dim. */
  muted?: boolean
  /** DOM id, so the card can be scrolled into view. */
  anchorId?: string
}

const BASE = 'flex shrink-0 flex-col gap-1.5 rounded-md border p-2.5 text-left'

function look(selected: boolean, muted: boolean): string {
  if (muted) return 'border-dashed border-zinc-800 bg-transparent text-zinc-500'
  if (selected) return 'border-zinc-300 bg-zinc-800 ring-1 ring-zinc-300'
  return 'border-zinc-800 bg-zinc-900'
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
      className={`${className} w-full min-w-0 hover:border-zinc-600 focus-visible:border-zinc-400 focus-visible:outline-none`}
    >
      {children}
    </button>
  )
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500">{children}</div>
}

/** Secondary prose under a card's title, cut to two lines. */
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="line-clamp-2 text-[10px] leading-4 text-zinc-500">{children}</p>
}

/** Wraps to at most three lines. */
export function CardTitle({ children, prefix }: { children: ReactNode; prefix?: string }) {
  return (
    <div className="line-clamp-3 text-xs leading-snug text-zinc-100">
      {prefix && <span className="mr-1 tabular-nums text-zinc-500">{prefix}</span>}
      {children}
    </div>
  )
}
