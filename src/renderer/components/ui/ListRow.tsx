import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { DropLine, type Sortable } from './SortableItem'

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
  /** A 2 px edge on the left that marks the row, e.g. a waiting session. */
  edge?: 'waiting'
  /** `roomy`: a 36 px row indented under a group sub-header; it ignores `nested`. */
  size?: 'compact' | 'roomy'
  /** Makes the whole row draggable. */
  sortable?: Sortable
  onKeyDown?: (e: KeyboardEvent) => void
  /** Finds the row again, e.g. to keep focus on it after it moves. */
  rowKey?: string
}

const ROOMY = 'h-9 pl-8 pr-2'

const compactBox = (nested: boolean): string => `py-1 ${nested ? 'pl-9 pr-2' : 'px-3'}`

const EDGE = { waiting: 'shadow-[inset_2px_0_0_0_rgb(var(--cc-status-approval))]' } as const

const DISABLED = 'cursor-default text-faint'
const IDLE = 'text-fg hover:bg-list-hover focus-visible:bg-list-hover'
const ACTIVE = 'bg-list-selected text-fg'

export function ListRow({ children, onClick, onDoubleClick, onContextMenu, tooltip, nested = false, active = false, actions, actionsPinned = false, disabled = false, edge, size = 'compact', sortable, onKeyDown, rowKey }: Props) {
  const box = size === 'roomy' ? ROOMY : compactBox(nested)
  return (
    <li className="group relative" {...sortable?.props}>
      <button
        onClick={onClick}
        onKeyDown={onKeyDown}
        data-row-key={rowKey}
        disabled={disabled}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={tooltip}
        aria-current={active || undefined}
        className={`flex w-full min-w-0 items-center gap-2 text-left text-xs focus-visible:outline-none ${box} ${disabled ? DISABLED : active ? ACTIVE : IDLE} ${edge ? EDGE[edge] : ''}`}
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
      {sortable && <DropLine side={sortable.over} />}
    </li>
  )
}

/** A roomy row's place taken by something other than the row, e.g. its rename field. */
export function ListRowSlot({ children }: { children: ReactNode }) {
  return <li className={`flex items-center ${ROOMY}`}>{children}</li>
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
export function markMatches(text: string, query: string): ReactNode[] {
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let from = 0
  for (let at = q ? lower.indexOf(q) : -1; at !== -1; at = lower.indexOf(q, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-clay/20 text-inherit">{text.slice(at, at + q.length)}</mark>)
    from = at + q.length
  }
  parts.push(text.slice(from))
  return parts
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

interface ListItemProps {
  children: ReactNode
  tooltip?: string
  nested?: boolean
  /** Padded like a compact ListRow, so it lines up among clickable rows. */
  alignWithRows?: boolean
  /** Shown under the row, e.g. its output. */
  detail?: ReactNode
}

/** A non-clickable row: text plus trailing actions. */
export function ListItem({ children, tooltip, nested = false, alignWithRows = false, detail }: ListItemProps) {
  const box = alignWithRows ? compactBox(nested) : `py-0.5 ${nested ? 'pl-6' : ''}`
  const row = `flex w-full min-w-0 items-center gap-2 text-xs text-fg ${box}`
  if (!detail) {
    return (
      <li title={tooltip} className={row}>
        {children}
      </li>
    )
  }
  return (
    <li className="flex flex-col gap-1 pb-2">
      <div title={tooltip} className={row}>
        {children}
      </div>
      <div className={nested ? 'pl-6' : ''}>{detail}</div>
    </li>
  )
}
