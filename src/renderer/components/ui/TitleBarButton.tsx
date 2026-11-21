import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  label: string
  tooltip?: string
  pressed?: boolean
}

/** A full-height icon button in the window's title bar. */
export function TitleBarButton({ children, onClick, label, tooltip, pressed = false }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={tooltip ?? label}
      className={
        'flex h-full shrink-0 items-center px-3 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus ' +
        (pressed ? 'bg-editor text-fg' : 'text-muted hover:bg-list-hover hover:text-fg')
      }
    >
      {children}
    </button>
  )
}
