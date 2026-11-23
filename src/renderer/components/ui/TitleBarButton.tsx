import { forwardRef, type ReactNode } from 'react'
import type { AccountColor } from '../../state/accountColors'
import { ACCENT_RING } from './accountAccent'

interface Props {
  children: ReactNode
  onClick: () => void
  label: string
  tooltip?: string
  pressed?: boolean
  /** Marks the item that belongs to what is on screen. */
  current?: boolean
  /** Faded while another item is current. */
  dimmed?: boolean
  /** The ring colour of a current item; the focus colour without one. */
  accent?: AccountColor | null
}

/** A full-height button in the window's title bar. */
export const TitleBarButton = forwardRef<HTMLButtonElement, Props>(function TitleBarButton(
  { children, onClick, label, tooltip, pressed = false, current = false, dimmed = false, accent = null },
  ref
) {
  const ring = `ring-2 ring-inset ${accent ? ACCENT_RING[accent] : 'ring-focus'}`
  const look = pressed
    ? 'bg-editor text-fg'
    : current
      ? `bg-list-selected text-fg ${ring}`
      : `text-muted hover:bg-list-hover hover:text-fg ${dimmed ? 'opacity-50 hover:opacity-100' : ''}`
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
