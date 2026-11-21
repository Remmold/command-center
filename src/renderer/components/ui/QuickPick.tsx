import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'

export interface QuickPickItem {
  key: string
  /** A leading picture, such as a repo icon; `icon` draws a plain glyph instead. */
  leading?: ReactNode
  icon?: LucideIcon
  label: string
  description?: string
  onPick: () => void
}

interface Props {
  label: string
  placeholder: string
  query: string
  onQueryChange: (query: string) => void
  items: readonly QuickPickItem[]
  /** Always listed after the matches, below a divider, whatever the query. */
  footer?: readonly QuickPickItem[]
  empty: string
  onClose: () => void
}

/** A palette at the top centre of the window: a filter input over a list, driven by ↑ ↓ Enter and Escape. */
export function QuickPick({ label, placeholder, query, onQueryChange, items, footer = [], empty, onClose }: Props) {
  const all = [...items, ...footer]
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listId = useId()

  useEffect(() => setSelected(0), [query])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const pick = (item: QuickPickItem | undefined) => {
    if (!item) return
    onClose()
    item.onPick()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (step !== undefined && all.length > 0) {
      e.preventDefault()
      setSelected((i) => (i + step + all.length) % all.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(all[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        onMouseDown={(e) => e.stopPropagation()}
        className="mx-auto mt-2 flex max-h-[60vh] w-[600px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-md border border-strong bg-widget p-1 shadow-lg"
      >
        <input
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
          {items.length === 0 && <li className="px-2 py-1 text-sm text-muted">{empty}</li>}
          {all.map((item, i) => (
            <QuickPickRow
              key={item.key}
              item={item}
              selected={i === selected}
              divided={i === items.length && i > 0}
              onHover={() => setSelected(i)}
              onPick={() => pick(item)}
            />
          ))}
        </ul>
      </div>
    </div>,
    document.body
  )
}

interface RowProps {
  item: QuickPickItem
  selected: boolean
  divided: boolean
  onHover: () => void
  onPick: () => void
}

function QuickPickRow({ item, selected, divided, onHover, onPick }: RowProps) {
  const Icon = item.icon
  return (
    <li
      role="option"
      aria-selected={selected}
      onMouseMove={onHover}
      onClick={onPick}
      className={`flex h-[22px] cursor-pointer items-center gap-1.5 rounded-sm px-2 text-sm text-fg ${selected ? 'bg-list-selected' : ''} ${divided ? 'mt-1 border-t border-subtle' : ''}`}
    >
      {item.leading}
      {Icon && <Icon size={14} strokeWidth={1.75} className="shrink-0 text-muted" />}
      <span className="shrink-0 truncate">{item.label}</span>
      {item.description && <span className="min-w-0 truncate text-xs text-muted">{item.description}</span>}
    </li>
  )
}
