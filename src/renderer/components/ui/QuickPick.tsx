import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { IconButton } from './IconButton'
import { markMatches } from './ListRow'

export interface QuickPickItem {
  key: string
  /** A leading picture, such as a repo icon; `icon` draws a plain glyph instead. */
  leading?: ReactNode
  icon?: LucideIcon
  label: string
  description?: string
  tooltip?: string
  /** At the row's right end, such as an account tag or an age. */
  trailing?: ReactNode
  /** Shown at the right end while the row is hovered or selected. */
  actions?: ReactNode
  /** Drawn in place of the row, such as a rename field; the row can't be picked meanwhile. */
  editor?: ReactNode
  /** Picking it leaves the picker open, e.g. to move to another step. */
  keepOpen?: boolean
  /** F2 on the selected row, as rename in VS Code. */
  onRename?: () => void
  onPick: () => void
}

interface Props {
  label: string
  placeholder: string
  query: string
  onQueryChange: (query: string) => void
  /** A title bar over the input; with `onBack` it gets a Back arrow, and Backspace on an empty filter goes back. */
  title?: string
  onBack?: () => void
  /** Always listed before the matches, whatever the query. */
  pinned?: readonly QuickPickItem[]
  items: readonly QuickPickItem[]
  /** Always listed after the matches, below a divider, whatever the query. */
  footer?: readonly QuickPickItem[]
  /** Marks this text in the labels and descriptions of `items`. */
  highlight?: string
  empty: string
  onClose: () => void
}

/** A palette at the top centre of the window: a filter input over a list, driven by ↑ ↓ Enter and Escape. */
export function QuickPick({ label, placeholder, query, onQueryChange, title, onBack, pinned = [], items, footer = [], highlight = '', empty, onClose }: Props) {
  const all = [...pinned, ...items, ...footer]
  // By key, so rows arriving or going (a refresh, Show all) never move the selection onto another row.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const found = all.findIndex((item) => item.key === selectedKey)
  const selected = found === -1 ? 0 : found
  const listRef = useRef<HTMLUListElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const editing = all.some((item) => item.editor)

  useEffect(() => setSelectedKey(null), [query])

  useEffect(() => {
    if (!editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const pick = (item: QuickPickItem | undefined) => {
    if (!item || item.editor) return
    if (!item.keepOpen) onClose()
    item.onPick()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (step !== undefined && all.length > 0) {
      e.preventDefault()
      setSelectedKey(all[(selected + step + all.length) % all.length].key)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(all[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Backspace' && query === '' && onBack) {
      e.preventDefault()
      onBack()
    } else if (e.key === 'F2' && all[selected]?.onRename) {
      e.preventDefault()
      all[selected].onRename?.()
    }
  }

  const emptyHint = <li className="px-2 py-1 text-sm text-muted">{empty}</li>
  const firstItem = pinned.length
  const firstFooter = pinned.length + items.length

  return createPortal(
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        onMouseDown={(e) => e.stopPropagation()}
        className="mx-auto mt-2 flex max-h-[60vh] w-[600px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-md border border-strong bg-widget p-1 shadow-lg"
      >
        {title && (
          <div className="mb-1 flex h-[22px] shrink-0 items-center gap-1 px-0.5 text-sm text-fg">
            {onBack && (
              <IconButton label="Back" tooltip="Back (Backspace)" onClick={onBack}>
                <ArrowLeft size={14} />
              </IconButton>
            )}
            <span className="min-w-0 flex-1 truncate text-center">{title}</span>
            {onBack && <span className="w-[18px] shrink-0" />}
          </div>
        )}
        <input
          ref={inputRef}
          aria-label={label}
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          value={query}
          placeholder={placeholder}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="mb-1 w-full rounded-sm border border-focus bg-input px-1.5 py-1 text-sm text-fg placeholder:text-faint focus:outline-none"
        />
        <ul id={listId} ref={listRef} role="listbox" aria-label={label} className="scrollbar-thin min-h-0 overflow-y-auto">
          {all.map((item, i) => (
            <Fragment key={item.key}>
              {i === firstItem && items.length === 0 && emptyHint}
              <QuickPickRow
                item={item}
                highlight={i >= firstItem && i < firstFooter ? highlight : ''}
                selected={i === selected}
                divided={i === firstFooter && i > 0}
                onHover={() => setSelectedKey(item.key)}
                onPick={() => pick(item)}
              />
            </Fragment>
          ))}
          {items.length === 0 && footer.length === 0 && emptyHint}
        </ul>
      </div>
    </div>,
    document.body
  )
}

interface RowProps {
  item: QuickPickItem
  highlight: string
  selected: boolean
  divided: boolean
  onHover: () => void
  onPick: () => void
}

function QuickPickRow({ item, highlight, selected, divided, onHover, onPick }: RowProps) {
  const Icon = item.icon
  if (item.editor) return <li className="px-2 py-0.5">{item.editor}</li>
  return (
    <li
      role="option"
      aria-selected={selected}
      onMouseMove={onHover}
      onClick={onPick}
      title={item.tooltip}
      className={`group flex h-[22px] cursor-pointer items-center gap-1.5 rounded-sm px-2 text-sm text-fg ${selected ? 'bg-list-selected' : ''} ${divided ? 'mt-1 border-t border-subtle' : ''}`}
    >
      {item.leading}
      {Icon && <Icon size={14} strokeWidth={1.75} className="shrink-0 text-muted" />}
      <span className="min-w-0 shrink truncate">{markMatches(item.label, highlight)}</span>
      {item.description && <span className="min-w-0 flex-1 truncate text-xs text-muted">{markMatches(item.description, highlight)}</span>}
      {(item.trailing || item.actions) && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted">
          {item.trailing}
          {item.actions && <span className={selected ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}>{item.actions}</span>}
        </span>
      )}
    </li>
  )
}
