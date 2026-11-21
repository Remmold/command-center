import type { ReactNode } from 'react'

type Variant = 'primary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  ghost: 'text-muted hover:bg-list-hover hover:text-fg'
}

interface Props {
  children: ReactNode
  onClick: () => void
  variant?: Variant
  tooltip?: string
  label?: string
  pressed?: boolean
}

const PRESSED = 'bg-list-selected text-fg hover:bg-strong'

export function Button({ children, onClick, variant = 'primary', tooltip, label, pressed }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={label}
      aria-pressed={pressed}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ${pressed ? PRESSED : VARIANTS[variant]}`}
    >
      {children}
    </button>
  )
}
