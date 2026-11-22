import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  /** An image URL; without one the icon shows. */
  thumbnail?: string
  icon: ReactNode
  name: string
  meta: string
  onRemove: () => void
}

/** An attached file waiting to be sent. */
export function FileChip({ thumbnail, icon, name, meta, onRemove }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-subtle bg-sidebar py-1.5 pl-1.5 pr-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-input text-muted">
        {thumbnail ? <img src={thumbnail} alt={name} className="h-full w-full object-cover" /> : icon}
      </span>
      <span className="min-w-0 max-w-[200px]">
        <span className="block truncate text-[12px] text-fg" title={name}>
          {name}
        </span>
        <span className="block truncate text-[10px] text-muted">{meta}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-muted hover:bg-list-hover hover:text-error"
        aria-label={`Remove ${name}`}
        title="Remove"
      >
        <X size={12} strokeWidth={2.25} />
      </button>
    </div>
  )
}

export function FileChipRow({ children }: { children: ReactNode }) {
  return <div className="mb-2 flex flex-wrap gap-2">{children}</div>
}
