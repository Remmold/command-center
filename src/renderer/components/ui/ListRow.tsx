import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  tooltip?: string
  nested?: boolean
  active?: boolean
}

const IDLE = 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:bg-zinc-900'
const ACTIVE = 'bg-zinc-800 text-zinc-100'

export function ListRow({ children, onClick, tooltip, nested = false, active = false }: Props) {
  return (
    <li>
      <button
        onClick={onClick}
        title={tooltip}
        aria-current={active || undefined}
        className={`flex w-full min-w-0 items-center gap-2 py-1 text-left text-xs focus-visible:outline-none ${nested ? 'pl-9 pr-2' : 'px-3'} ${active ? ACTIVE : IDLE}`}
      >
        {children}
      </button>
    </li>
  )
}

export function ListRowText({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      {primary}
      {secondary && <span className="text-zinc-500"> · {secondary}</span>}
    </span>
  )
}

export function ListRowMeta({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{children}</span>
}

/** A non-clickable row: text plus trailing actions. */
export function ListItem({ children, tooltip, nested = false }: { children: ReactNode; tooltip?: string; nested?: boolean }) {
  return (
    <li title={tooltip} className={`flex w-full min-w-0 items-center gap-2 py-0.5 text-xs text-zinc-300 ${nested ? 'pl-6' : ''}`}>
      {children}
    </li>
  )
}
