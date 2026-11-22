import { useState, type DragEvent, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

/** The row being dragged; a drop only lands within the same group. */
let dragging: { id: string; group: string } | null = null

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
  const [over, setOver] = useState(false)
  const [armed, setArmed] = useState(false)
  const accepts = () => dragging !== null && dragging.group === group && dragging.id !== id

  const onDragOver = (e: DragEvent) => {
    if (!accepts()) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOver(true)
  }
  const onDrop = (e: DragEvent) => {
    setOver(false)
    if (!accepts() || !dragging) return
    e.preventDefault()
    onMove(dragging.id, id)
  }

  return (
    <li
      title={tooltip}
      aria-label={label}
      draggable={armed}
      onDragStart={(e) => {
        dragging = { id, group }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
      }}
      onDragEnd={() => {
        dragging = null
        setArmed(false)
      }}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`group flex w-full min-w-0 items-center gap-2 border-t py-0.5 text-xs text-fg ${over ? 'border-accent' : 'border-transparent'}`}
    >
      <span
        aria-hidden
        onPointerDown={() => setArmed(true)}
        onPointerUp={() => setArmed(false)}
        className="shrink-0 cursor-grab text-faint hover:text-fg"
      >
        <GripVertical size={12} />
      </span>
      {children}
    </li>
  )
}
