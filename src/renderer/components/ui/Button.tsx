import type { ReactNode } from 'react'

type Variant = 'primary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-zinc-100 text-zinc-900 hover:bg-white',
  ghost: 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
}

interface Props {
  children: ReactNode
  onClick: () => void
  variant?: Variant
  tooltip?: string
  label?: string
  pressed?: boolean
}

const PRESSED = 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'

export function Button({ children, onClick, variant = 'primary', tooltip, label, pressed }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={label}
      aria-pressed={pressed}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400 ${pressed ? PRESSED : VARIANTS[variant]}`}
    >
      {children}
    </button>
  )
}
