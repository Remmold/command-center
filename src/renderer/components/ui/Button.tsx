import { forwardRef, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-input text-fg hover:bg-strong',
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

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { children, onClick, variant = 'primary', tooltip, label, pressed },
  ref
) {
  return (
    <button
      ref={ref}
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
})
