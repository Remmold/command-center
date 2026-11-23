import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  /** An image URL; without one the icon shows. */
  thumbnail?: string
  icon: ReactNode
  name: string
  meta: string
  onRemove: () => void
  /** Makes the chip a toggle for its details. */
  onToggle?: () => void
  expanded?: boolean
  tone?: 'normal' | 'error'
}

const META_TONE = { normal: 'text-muted', error: 'text-error' } as const

/** An attached file waiting to be sent. */
export function FileChip({ thumbnail, icon, name, meta, onRemove, onToggle, expanded, tone = 'normal' }: Props) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-input text-muted">
        {thumbnail ? <img src={thumbnail} alt={name} className="h-full w-full object-cover" /> : icon}
      </span>
      <span className="min-w-0 max-w-[220px] text-left">
        <span className="block truncate text-[12px] text-fg" title={name}>
          {name}
        </span>
        <span className={`block truncate text-[10px] ${META_TONE[tone]}`} title={meta}>
          {meta}
        </span>
      </span>
    </>
  )
  return (
    <div className="flex items-center gap-2 rounded-md border border-subtle bg-sidebar py-1.5 pl-1.5 pr-2">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${name}: ${meta}`}
          className="flex min-w-0 items-center gap-2 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
        >
          {body}
        </button>
      ) : (
        body
      )}
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

/** What an expanded chip shows, under the chip row. */
export function FileChipDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mb-2 flex max-h-80 flex-col gap-2 overflow-auto rounded-md border border-subtle bg-sidebar p-2">
      {children}
    </section>
  )
}

/** Images side by side at one height, scrolling sideways. */
export function ImageStrip({ images }: { images: readonly { src: string; alt: string }[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {images.map((image, i) => (
        <img key={i} src={image.src} alt={image.alt} className="h-32 w-auto shrink-0 rounded border border-subtle" />
      ))}
    </div>
  )
}
