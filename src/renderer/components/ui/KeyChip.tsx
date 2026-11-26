import { X } from 'lucide-react'

interface Props {
  /** The key as a person reads it, such as Ctrl+K Ctrl+S. */
  label: string
  /** Shows a remove button named by `removeLabel`. */
  onRemove?: () => void
  removeLabel?: string
}

/** A key or chord shown as a keycap, with an optional remove. */
export function KeyChip({ label, onRemove, removeLabel }: Props) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-strong bg-input px-1 font-mono text-[10px] leading-4 text-fg">
      {label}
      {onRemove && (
        <button type="button" aria-label={removeLabel ?? `Remove ${label}`} title={removeLabel ?? `Remove ${label}`} onClick={onRemove} className="rounded text-muted hover:text-fg">
          <X size={10} />
        </button>
      )}
    </span>
  )
}
