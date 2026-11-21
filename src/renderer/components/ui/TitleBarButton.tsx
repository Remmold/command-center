import { forwardRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  label: string
  tooltip?: string
  pressed?: boolean
  /** Marks the item that belongs to what is on screen. */
  current?: boolean
}

/** A full-height button in the window's title bar. */
export const TitleBarButton = forwardRef<HTMLButtonElement, Props>(function TitleBarButton(
  { children, onClick, label, tooltip, pressed = false, current = false },
  ref
) {
  const look = pressed ? 'bg-editor text-fg' : current ? 'bg-list-selected text-fg' : 'text-muted hover:bg-list-hover hover:text-fg'
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-current={current || undefined}
      title={tooltip ?? label}
      className={
        'flex h-full shrink-0 items-center gap-2 px-3 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus ' +
        look
      }
    >
      {children}
    </button>
  )
})
