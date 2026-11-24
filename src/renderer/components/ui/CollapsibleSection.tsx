import type { MouseEvent, ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DragGrip, DropLine, type Sortable } from './SortableItem'

interface Props {
  title: string
  open: boolean
  onToggle: () => void
  /** Shown after the title whether the section is open or not, e.g. a count badge. */
  badge?: ReactNode
  tooltip?: string
  /** Shown before the title, e.g. an account's colour. */
  marker?: ReactNode
  /** `pane` heads a side bar block; `group` is a lighter sub-header nested inside one. */
  level?: 'pane' | 'group'
  /** Shown over the header's right end while it is hovered or holds focus, unless pinned. */
  actions?: ReactNode
  actionsPinned?: boolean
  onContextMenu?: (e: MouseEvent) => void
  /** Makes the header draggable, with a grip among its actions, and a place to drop onto. */
  sortable?: Sortable
  /** Takes the header's place, e.g. a field to rename the section. */
  headerSlot?: ReactNode
  children: ReactNode
}

const LEVEL = {
  pane: { section: '', button: 'gap-1 px-1 font-bold text-fg', slot: 'px-1' },
  group: { section: 'pt-1.5', button: 'gap-1.5 px-3 font-medium text-muted', slot: 'pl-3 pr-2' }
} as const

/** A foldable block of a side bar, headed like a VS Code view pane. */
export function CollapsibleSection({ title, open, onToggle, badge, tooltip, marker, level = 'pane', actions, actionsPinned = false, onContextMenu, sortable, headerSlot, children }: Props) {
  const look = LEVEL[level]
  return (
    <section aria-label={title} className={look.section || undefined}>
      {headerSlot ? (
        <div data-section-header className={`flex min-h-[22px] items-center ${look.slot}`}>
          {headerSlot}
        </div>
      ) : (
        <div data-section-header className="group relative" {...sortable?.props}>
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            onContextMenu={onContextMenu}
            title={tooltip}
            className={`flex h-[22px] w-full min-w-0 items-center text-left text-[11px] hover:bg-list-hover focus-visible:bg-list-hover focus-visible:outline-none ${look.button}`}
          >
            {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
            {marker}
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {badge}
          </button>
          {(actions || sortable) && (
            <span
              className={`absolute inset-y-0 right-1 flex items-center gap-0.5 bg-list-hover ${actionsPinned ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}`}
            >
              {actions}
              {sortable?.props.draggable && <DragGrip />}
            </span>
          )}
          {sortable && <DropLine side={sortable.over} />}
        </div>
      )}
      {open && children}
    </section>
  )
}
