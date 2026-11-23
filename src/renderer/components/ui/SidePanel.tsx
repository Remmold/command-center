import { useRef, type PointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { SectionHeader } from './SectionHeader'

interface Props {
  title: string
  width: number
  /** Called while the left edge is dragged, with the width it asks for. */
  onResize: (width: number) => void
  onClose: () => void
  closeTooltip?: string
  children: ReactNode
}

/** A titled column on a pane's right, resized by dragging its left edge. */
export function SidePanel({ title, width, onResize, onClose, closeTooltip, children }: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, width }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) onResize(drag.current.width + drag.current.x - e.clientX)
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <aside aria-label={title} style={{ width }} className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-subtle bg-sidebar">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${title}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-y-0 -left-0.5 z-10 w-1 cursor-col-resize hover:bg-focus active:bg-focus"
      />
      <SectionHeader title={title}>
        <IconButton onClick={onClose} label={`Close ${title}`} tooltip={closeTooltip}>
          <X size={14} />
        </IconButton>
      </SectionHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
    </aside>
  )
}
