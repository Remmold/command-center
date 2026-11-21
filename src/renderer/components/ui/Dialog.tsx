import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface Props {
  title: string
  onClose: () => void
  maxWidth?: number
  children: ReactNode
}

/** A centred modal with a title bar and a close button; Escape or a click outside closes it. */
export function Dialog({ title, onClose, maxWidth = 440, children }: Props) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closeRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-md border border-strong bg-widget text-xs text-fg shadow-lg"
      >
        <header className="flex items-center justify-between gap-2 border-b border-subtle px-4 py-2.5">
          <h2 className="text-sm font-medium">{title}</h2>
          <IconButton onClick={onClose} label="Close">
            <X size={14} strokeWidth={2} />
          </IconButton>
        </header>
        <div className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>,
    document.body
  )
}
