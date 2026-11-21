import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Controls beside the title, e.g. a checkbox. */
  actions?: ReactNode
}

/** A small centred modal; Escape or a click outside closes it. */
export function Dialog({ title, onClose, children, actions }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">{title}</h2>
          {actions}
          <Button variant="ghost" onClick={onClose} label="Close" tooltip="Close (Esc)">
            <X size={14} />
          </Button>
        </header>
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>,
    document.body
  )
}
