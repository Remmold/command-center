import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  onDoubleClick?: () => void
  tooltip?: string
  nested?: boolean
  active?: boolean
}

const IDLE = 'text-fg hover:bg-list-hover focus-visible:bg-list-hover'
const ACTIVE = 'bg-list-selected text-fg'

export function ListRow({ children, onClick, onDoubleClick, tooltip, nested = false, active = false }: Props) {
  return (
    <li>
      <button
        onClick={onClick}
        onDoubleClick={onDoubleClick}
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
      {secondary && <span className="text-muted"> · {secondary}</span>}
    </span>
  )
}

export function ListRowLabel({ children, tooltip, tone = 'primary' }: { children: ReactNode; tooltip?: string; tone?: 'primary' | 'secondary' }) {
  const look = tone === 'primary' ? 'font-medium text-fg' : 'text-muted'
  return (
    <span title={tooltip} className={`max-w-[16rem] shrink-0 truncate ${look}`}>
      {children}
    </span>
  )
}

export function ListRowNote({ children }: { children: string | null }) {
  return (
    <span title={children ?? undefined} className="min-w-0 flex-1 truncate text-[11px] text-muted">
      {children}
    </span>
  )
}

export function ListRowMeta({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[10px] tabular-nums text-muted">{children}</span>
}

/** A non-clickable row: text plus trailing actions. */
export function ListItem({ children, tooltip, nested = false }: { children: ReactNode; tooltip?: string; nested?: boolean }) {
  return (
    <li title={tooltip} className={`flex w-full min-w-0 items-center gap-2 py-0.5 text-xs text-fg ${nested ? 'pl-6' : ''}`}>
      {children}
    </li>
  )
}
