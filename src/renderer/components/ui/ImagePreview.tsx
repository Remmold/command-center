import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { Button } from './Button'

interface Props {
  name: string
  /** Null while the file is looked up or when it is missing; `missing` says which. */
  src: string | null
  video?: boolean
  missing?: boolean
  onClose: () => void
  onOpenExternally?: () => void
  /** Set when there is a previous or next file to step to, by button or arrow key. */
  onPrevious?: () => void
  onNext?: () => void
}

const STEP = 'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-strong bg-widget text-fg hover:bg-list-hover disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'

/** The extension's image preview: the image fitted to the window on a dark backdrop; Escape, a click outside or × closes it. Also plays a video. */
export function ImagePreview({ name, src, video = false, missing = false, onClose, onOpenExternally, onPrevious, onNext }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const handlers = useRef({ onClose, onPrevious, onNext })
  handlers.current = { onClose, onPrevious, onNext }
  const stepping = onPrevious !== undefined || onNext !== undefined

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const handler =
        e.key === 'Escape' ? handlers.current.onClose : e.key === 'ArrowLeft' ? handlers.current.onPrevious : e.key === 'ArrowRight' ? handlers.current.onNext : undefined
      if (!handler) return
      e.preventDefault()
      e.stopPropagation()
      handler()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      returnTo?.focus({ preventScroll: true })
    }
  }, [])

  const media = !src ? (
    <div className="flex h-48 w-72 items-center justify-center rounded-lg bg-widget text-sm text-muted">{missing ? 'File not found' : ''}</div>
  ) : video ? (
    <video key={src} src={src} controls autoPlay className="max-h-[calc(90vh-40px)] max-w-[90vw] rounded-lg shadow-lg" />
  ) : (
    <img src={src} alt={name} className="max-h-[calc(90vh-40px)] max-w-[90vw] rounded-lg object-contain shadow-lg" />
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/85" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={name} className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
        {media}
        <div className="flex items-center gap-2">
          <span className="max-w-[50vw] truncate text-xs text-muted">{name}</span>
          {onOpenExternally && (
            <Button variant="secondary" onClick={onOpenExternally}>
              <ExternalLink size={12} />
              Open externally
            </Button>
          )}
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
      {stepping && (
        <>
          <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onPrevious} disabled={!onPrevious} title="Previous (Left Arrow)" aria-label="Previous" className={`${STEP} left-4`}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onNext} disabled={!onNext} title="Next (Right Arrow)" aria-label="Next" className={`${STEP} right-4`}>
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
