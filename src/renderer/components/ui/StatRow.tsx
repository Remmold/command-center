import type { ReactNode } from 'react'

interface Props {
  label: string
  /** The headline reading, right-aligned beside the label. */
  value: ReactNode
  gauge: ReactNode
  detail: ReactNode
  tooltip?: string
}

export function StatRow({ label, value, gauge, detail, tooltip }: Props) {
  return (
    <li title={tooltip} className="flex min-w-0 flex-col gap-1 px-3 py-1.5 text-xs">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
        <span className="shrink-0 tabular-nums text-muted">{value}</span>
      </span>
      {gauge}
      <span className="min-w-0 truncate text-[11px] text-muted">{detail}</span>
    </li>
  )
}
