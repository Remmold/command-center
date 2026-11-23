import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface Props {
  title: string
  onClose: () => void
  maxWidth?: number
  /** `tall`: a fixed-height frame whose body lays out its own panes and scrolling. */
  size?: 'fit' | 'tall'
  /** A `data-` attribute name set on the dialog, so code can tell it from other dialogs. */
  marker?: 'approval-inbox'
  children: ReactNode
}

const FRAME = { fit: 'max-h-[80vh]', tall: 'h-[85vh]' } as const
const BODY = { fit: 'scrollbar-thin min-h-0 overflow-y-auto px-4 py-3', tall: 'flex min-h-0 flex-1' } as const

/** A centred modal with a title bar and a close button; Escape or a click outside closes it. */
export function Dialog({ title, onClose, maxWidth = 440, size = 'fit', marker, children }: Props) {
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
        {...(marker ? { [`data-${marker}`]: '' } : {})}
        style={{ maxWidth }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex ${FRAME[size]} w-full flex-col overflow-hidden rounded-md border border-strong bg-widget text-xs text-fg shadow-lg`}
      >
        <header className="flex items-center justify-between gap-2 border-b border-subtle px-4 py-2.5">
          <h2 className="text-sm font-medium">{title}</h2>
          <IconButton onClick={onClose} label="Close">
            <X size={14} strokeWidth={2} />
          </IconButton>
        </header>
        <div className={BODY[size]}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
