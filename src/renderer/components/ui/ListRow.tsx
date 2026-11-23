import type { MouseEvent, ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: (e: MouseEvent) => void
  onDoubleClick?: () => void
  onContextMenu?: (e: MouseEvent) => void
  tooltip?: string
  nested?: boolean
  active?: boolean
  /** Shown over the row's right end while it is hovered or holds focus, unless pinned. */
  actions?: ReactNode
  actionsPinned?: boolean
  disabled?: boolean
}

const DISABLED = 'cursor-default text-faint'
const IDLE = 'text-fg hover:bg-list-hover focus-visible:bg-list-hover'
const ACTIVE = 'bg-list-selected text-fg'

export function ListRow({ children, onClick, onDoubleClick, onContextMenu, tooltip, nested = false, active = false, actions, actionsPinned = false, disabled = false }: Props) {
  return (
    <li className="group relative">
      <button
        onClick={onClick}
        disabled={disabled}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={tooltip}
        aria-current={active || undefined}
        className={`flex w-full min-w-0 items-center gap-2 py-1 text-left text-xs focus-visible:outline-none ${nested ? 'pl-9 pr-2' : 'px-3'} ${disabled ? DISABLED : active ? ACTIVE : IDLE}`}
      >
        {children}
      </button>
      {actions && (
        <span
          className={`absolute inset-y-0 right-1 flex items-center ${active ? 'bg-list-selected' : 'bg-list-hover'} ${actionsPinned ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}`}
        >
          {actions}
        </span>
      )}
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

/** Every case-insensitive occurrence of `query` in `text` is marked, as the extension's session search. */
export function ListRowMatch({ text, query }: { text: string; query: string }) {
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let from = 0
  for (let at = q ? lower.indexOf(q) : -1; at !== -1; at = lower.indexOf(q, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-clay/20 text-inherit">{text.slice(at, at + q.length)}</mark>)
    from = at + q.length
  }
  parts.push(text.slice(from))
  return <span className="min-w-0 flex-1 truncate">{parts}</span>
}

interface ListRowLabelProps {
  children: ReactNode
  tooltip?: string
  tone?: 'primary' | 'secondary'
  /** Gives way to the row's title in a narrow Work list; the row's tooltip should carry it instead. */
  hideWhenNarrow?: boolean
}

export function ListRowLabel({ children, tooltip, tone = 'primary', hideWhenNarrow = false }: ListRowLabelProps) {
  const look = tone === 'primary' ? 'font-medium text-fg' : 'text-muted'
  return (
    <span title={tooltip} className={`max-w-[16rem] shrink-0 truncate ${look} ${hideWhenNarrow ? 'hide-in-narrow-list' : ''}`}>
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

/** Two stacked lines that take the row's free space: the row's identity, then its detail in smaller muted text. */
export function ListRowLines({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">{primary}</span>
      {secondary && <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted">{secondary}</span>}
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
