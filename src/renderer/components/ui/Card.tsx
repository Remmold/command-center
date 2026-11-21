import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  tooltip?: string
  onClick?: () => void
  selected?: boolean
}

const BASE = 'flex flex-col gap-1.5 rounded-md border bg-zinc-900 p-2.5 text-left'

export function Card({ children, tooltip, onClick, selected = false }: CardProps) {
  const border = selected ? 'border-zinc-400' : 'border-zinc-800'
  if (!onClick) {
    return (
      <div title={tooltip} className={`${BASE} ${border}`}>
        {children}
      </div>
    )
  }
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      aria-pressed={selected}
      className={`${BASE} ${border} w-full min-w-0 hover:border-zinc-600 focus-visible:border-zinc-400 focus-visible:outline-none`}
    >
      {children}
    </button>
  )
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500">{children}</div>
}

export function CardTitle({ children, prefix }: { children: ReactNode; prefix?: string }) {
  return (
    <div className="text-xs leading-snug text-zinc-100">
      {prefix && <span className="mr-1 tabular-nums text-zinc-500">{prefix}</span>}
      {children}
    </div>
  )
}
