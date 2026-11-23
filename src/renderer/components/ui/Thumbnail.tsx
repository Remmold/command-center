import { forwardRef, type MouseEvent, type ReactNode } from 'react'
import { Play } from 'lucide-react'

export const THUMBNAIL_SIZE = 160

interface Props {
  /** The picture: an `img`, a `video`, or a placeholder. */
  children: ReactNode
  caption: string
  detail?: ReactNode
  title?: string
  onOpen: () => void
  onContextMenu?: (e: MouseEvent) => void
  /** Small buttons shown over the picture while the tile is hovered or focused. */
  actions?: ReactNode
  actionsPinned?: boolean
}

/** A square preview with its name below; a click opens it. */
export const Thumbnail = forwardRef<HTMLDivElement, Props>(function Thumbnail(
  { children, caption, detail, title, onOpen, onContextMenu, actions, actionsPinned = false },
  ref
) {
  return (
    <div ref={ref} data-thumbnail="" className="group relative flex min-w-0 flex-col gap-1" onContextMenu={onContextMenu}>
      <button
        type="button"
        onClick={onOpen}
        title={title ?? caption}
        aria-label={caption}
        style={{ height: THUMBNAIL_SIZE }}
        className="relative flex w-full items-center justify-center overflow-hidden rounded border border-subtle bg-widget focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
      >
        {children}
      </button>
      {actions && (
        <div className={'absolute right-1 top-1 flex gap-0.5 rounded bg-widget/90 ' + (actionsPinned ? '' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100')}>
          {actions}
        </div>
      )}
      <div className="flex min-w-0 items-baseline justify-between gap-1">
        <span className="min-w-0 truncate text-[11px] text-fg">{caption}</span>
        {detail}
      </div>
    </div>
  )
})

/** Thumbnails in as many columns as fit. */
export function ThumbnailGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMBNAIL_SIZE}px, 1fr))` }}>
      {children}
    </div>
  )
}

/** The fitted picture inside a thumbnail, decoded off the main thread at tile size. */
export function ThumbnailImage({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} decoding="async" loading="lazy" draggable={false} width={THUMBNAIL_SIZE} height={THUMBNAIL_SIZE} className="h-full w-full object-cover" />
}

/** A video's first frame with a play mark over it. */
export function ThumbnailVideo({ src }: { src: string }) {
  return (
    <>
      <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-scrim/70 text-fg">
          <Play size={16} fill="currentColor" />
        </span>
      </span>
    </>
  )
}

/** Shown in place of a picture that cannot be loaded. */
export function ThumbnailPlaceholder({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1 px-2 text-center text-[11px] text-muted">
      {icon}
      {children}
    </span>
  )
}
