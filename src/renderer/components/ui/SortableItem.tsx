import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

/** What is being dragged: its id, what sort of thing it is, and the group it may be dropped within. */
export interface DragItem {
  id: string
  kind: string
  group: string
}

/** The item being dragged; drag events cannot read their data until the drop. */
let dragging: DragItem | null = null

export type DropSide = 'before' | 'after'

export interface SortableOptions {
  item: DragItem
  /** Only while true can the element be picked up, e.g. while its grip is held. */
  armed?: boolean
  /** Whether `dragged` may land on this element; a refused drop shows the not-allowed cursor. */
  accepts: (dragged: DragItem) => boolean
  /** `side` is the half of this element the pointer is over, unless `sideFor` fixes it. */
  onDrop: (dragged: DragItem, side: DropSide) => void
  /** Where `dragged` lands whichever half the pointer is over, e.g. a chat on a group header always goes below it. */
  sideFor?: (dragged: DragItem, pointer: DropSide) => DropSide
  onDragEnd?: () => void
}

export interface SortableElementProps {
  draggable: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragEnter: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export interface Sortable {
  /** Spread on the element that is dragged and dropped onto. */
  props: SortableElementProps
  /** Where a drop would land while something hovers over this element. */
  over: DropSide | null
}

const sideOf = (e: DragEvent): DropSide => {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY < box.top + box.height / 2 ? 'before' : 'after'
}

/** Drag-to-reorder for one element of a list, by HTML drag and drop. */
export function useSortable({ item, armed = true, accepts, onDrop, sideFor = (_d, pointer) => pointer, onDragEnd }: SortableOptions): Sortable {
  const [over, setOver] = useState<DropSide | null>(null)
  // Enters and leaves of the element's children bubble up, and Chromium's leave carries no relatedTarget; counting them tells when the pointer really left.
  const depth = useRef(0)
  const acceptable = (d: DragItem | null): d is DragItem => d !== null && !(d.kind === item.kind && d.id === item.id) && accepts(d)
  const hover = (e: DragEvent) => {
    const d = dragging
    if (!acceptable(d)) {
      e.dataTransfer.dropEffect = 'none'
      setOver(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setOver(sideFor(d, sideOf(e)))
  }

  return {
    over,
    props: {
      draggable: armed,
      onDragStart: (e) => {
        e.stopPropagation()
        dragging = item
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
      },
      onDragEnd: () => {
        dragging = null
        onDragEnd?.()
      },
      onDragEnter: (e) => {
        depth.current++
        hover(e)
      },
      onDragOver: hover,
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(null)
      },
      onDrop: (e) => {
        depth.current = 0
        setOver(null)
        const d = dragging
        if (!acceptable(d)) return
        e.preventDefault()
        e.stopPropagation()
        onDrop(d, sideFor(d, sideOf(e)))
      }
    }
  }
}

/** The line that shows where a drop lands, on the top or bottom edge of a `relative` element. */
export function DropLine({ side }: { side: DropSide | null }) {
  if (!side) return null
  return <span aria-hidden className={`pointer-events-none absolute inset-x-0 h-0.5 bg-accent ${side === 'before' ? 'top-0' : 'bottom-0'}`} />
}

/** The grip of a draggable row. */
export function DragGrip() {
  return (
    <span aria-hidden data-drag-grip className="flex shrink-0 cursor-grab items-center text-faint hover:text-fg">
      <GripVertical size={12} />
    </span>
  )
}

interface Props {
  id: string
  /** Rows can only be dropped among rows of the same group. */
  group: string
  /** `moved` is dropped onto this row and takes its place. */
  onMove: (moved: string, target: string) => void
  label: string
  tooltip?: string
  children: ReactNode
}

/** A list row that can be dragged by its grip to a new place in its group; the rest of the row keeps its clicks. */
export function SortableItem({ id, group, onMove, label, tooltip, children }: Props) {
  const [armed, setArmed] = useState(false)
  const sortable = useSortable({
    item: { id, kind: 'sortable-item', group },
    armed,
    accepts: (dragged) => dragged.kind === 'sortable-item' && dragged.group === group,
    onDrop: (dragged) => onMove(dragged.id, id),
    onDragEnd: () => setArmed(false)
  })

  return (
    <li
      title={tooltip}
      aria-label={label}
      {...sortable.props}
      className={`group flex w-full min-w-0 items-center gap-2 border-t py-0.5 text-xs text-fg ${sortable.over ? 'border-accent' : 'border-transparent'}`}
    >
      <span onPointerDown={() => setArmed(true)} onPointerUp={() => setArmed(false)} className="flex shrink-0">
        <DragGrip />
      </span>
      {children}
    </li>
  )
}
