import { useEffect, useRef } from 'react'

export interface AutocompleteItem {
  id: string
  primary: string
  secondary?: string
}

interface Props {
  items: AutocompleteItem[]
  selectedIndex: number
  onSelect: (item: AutocompleteItem) => void
  onHoverIndex: (index: number) => void
  header?: string
}

export function AutocompletePopup({ items, selectedIndex, onSelect, onHoverIndex, header }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null)

  // Keep selected item in view while navigating
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.querySelector<HTMLButtonElement>(`[data-index="${selectedIndex}"]`)
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <div className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-64 overflow-hidden rounded-md border border-subtle bg-widget shadow-xl">
      {header && (
        <div className="border-b border-subtle px-3 py-1 text-[10px] uppercase tracking-wide text-muted">
          {header}
        </div>
      )}
      <div ref={listRef} className="max-h-56 overflow-y-auto">
        {items.map((item, i) => {
          const active = i === selectedIndex
          return (
            <button
              key={item.id}
              data-index={i}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onHoverIndex(i)}
              className={
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ' +
                (active ? 'bg-list-selected text-fg' : 'text-fg hover:bg-list-hover')
              }
            >
              <span className="truncate font-mono">{item.primary}</span>
              {item.secondary && (
                <span className="ml-2 truncate text-muted">{item.secondary}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
