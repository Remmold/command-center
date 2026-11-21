import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  tooltip?: string
  /** Nesting under a parent row; 2 sits under a workspace row. */
  depth?: 0 | 2
  active?: boolean
}

const INDENT = { 0: 'px-3', 2: 'pl-9 pr-2' } as const
const IDLE = 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:bg-zinc-900'
const ACTIVE = 'bg-zinc-800 text-zinc-100'

export function ListRow({ children, onClick, tooltip, depth = 0, active = false }: Props) {
  return (
    <li>
      <button
        onClick={onClick}
        title={tooltip}
        aria-current={active || undefined}
        className={`flex w-full min-w-0 items-center gap-2 py-1 text-left text-xs focus-visible:outline-none ${INDENT[depth]} ${active ? ACTIVE : IDLE}`}
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
export function ListItem({ children, tooltip }: { children: ReactNode; tooltip?: string }) {
  return (
    <li title={tooltip} className="flex w-full min-w-0 items-center gap-2 py-0.5 text-xs text-zinc-300">
      {children}
    </li>
  )
}
