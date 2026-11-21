import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick: () => void
  tooltip?: string
}

export function ListRow({ children, onClick, tooltip }: Props) {
  return (
    <li>
      <button
        onClick={onClick}
        title={tooltip}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:bg-zinc-900 focus-visible:outline-none"
      >
        {children}
      </button>
    </li>
  )
}

export function ListRowText({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      {primary}
      {secondary && <span className="text-zinc-500"> · {secondary}</span>}
    </span>
  )
}

export function ListRowMeta({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{children}</span>
}
