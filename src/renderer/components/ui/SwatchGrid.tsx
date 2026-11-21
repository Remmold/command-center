import type { ReactNode } from 'react'

export function SwatchGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-8 gap-1">
      {children}
    </div>
  )
}

interface SwatchProps {
  label: string
  selected: boolean
  onClick: () => void
  /** Fills the swatch, for colour choices. */
  fill?: string
  children?: ReactNode
}

/** One square choice in a SwatchGrid: an icon, or a colour when `fill` is set. */
export function Swatch({ label, selected, onClick, fill, children }: SwatchProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      style={fill ? { backgroundColor: fill } : undefined}
      className={
        'flex h-6 w-6 items-center justify-center rounded text-zinc-300 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400 ' +
        (selected ? 'ring-2 ring-zinc-100 ' : '') +
        (fill ? '' : selected ? 'bg-zinc-700 text-zinc-100' : 'hover:bg-zinc-800 hover:text-zinc-100')
      }
    >
      {children}
    </button>
  )
}
