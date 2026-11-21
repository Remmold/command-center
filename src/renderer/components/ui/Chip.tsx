import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  selected: boolean
  onClick: () => void
  tooltip?: string
}

export function Chip({ children, selected, onClick, tooltip }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={tooltip}
      onClick={onClick}
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ' +
        (selected
          ? 'border-zinc-500 bg-zinc-700 text-zinc-100'
          : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200')
      }
    >
      {children}
    </button>
  )
}

export function ChipBar({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-1.5 px-3">{children}</div>
}

export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      {children}
    </div>
  )
}
