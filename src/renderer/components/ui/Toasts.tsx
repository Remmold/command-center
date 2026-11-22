import { X } from 'lucide-react'
import { useToastStore } from '../../state/toastStore'
import { IconButton } from './IconButton'

/** The stack of toasts in the bottom-right corner, newest last. */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div role="status" aria-label="Notifications" className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-sm items-center gap-2 rounded border border-strong bg-widget py-1.5 pl-3 pr-1 text-xs text-fg shadow-lg"
        >
          <span className="min-w-0 truncate">{t.text}</span>
          <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={12} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
