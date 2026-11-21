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
}

export function Button({ children, onClick, variant = 'primary', tooltip, label }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400 ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  )
}
