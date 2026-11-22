import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import { Button } from './Button'

interface Props {
  name: string
  src: string
  onClose: () => void
  onOpenExternally: () => void
}

/** The extension's image preview: the image fitted to the window on a dark backdrop; Escape, a click outside or × closes it. */
export function ImagePreview({ name, src, onClose, onOpenExternally }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      returnTo?.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/85" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={name} className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
        <img src={src} alt={name} className="max-h-[calc(90vh-40px)] max-w-[90vw] rounded-lg object-contain shadow-lg" />
        <div className="flex items-center gap-2">
          <span className="max-w-[50vw] truncate text-xs text-muted">{name}</span>
          <Button variant="secondary" onClick={onOpenExternally}>
            <ExternalLink size={12} />
            Open externally
          </Button>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          title="Close preview (Esc)"
          aria-label="Close preview"
          className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border border-strong bg-widget text-fg hover:bg-list-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body
  )
}
