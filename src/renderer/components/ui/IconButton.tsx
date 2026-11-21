import { forwardRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  label: string
  tooltip?: string
  /** Hidden until its row (a `group`) is hovered, unless pinned. */
  revealOnHover?: boolean
  pinned?: boolean
}

/** A small icon-only row action. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { children, onClick, label, tooltip, revealOnHover = false, pinned = false },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={label}
      title={tooltip ?? label}
      className={
        'rounded p-0.5 text-muted hover:bg-list-hover hover:text-fg focus-visible:opacity-100 ' +
        (revealOnHover && !pinned ? 'opacity-0 group-hover:opacity-100' : '')
      }
    >
      {children}
    </button>
  )
})
