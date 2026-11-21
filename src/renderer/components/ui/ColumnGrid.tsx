import type { CSSProperties, ReactNode } from 'react'
import { SectionLabel } from './SectionLabel'

const GRID = 'grid gap-2'

function gridColumns(count: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }
}

export function ColumnGridHeader({ columns }: { columns: { title: string; count: number }[] }) {
  return (
    <div className={`${GRID} shrink-0 px-2 pb-1`} style={gridColumns(columns.length)}>
      {columns.map(({ title, count }) => (
        <div key={title} className="flex items-center justify-between px-1">
          <SectionLabel as="h2">{title}</SectionLabel>
          <span className="text-[10px] tabular-nums text-zinc-500">{count}</span>
        </div>
      ))}
    </div>
  )
}

interface RowProps {
  header: ReactNode
  /** One node per column, in header order; empty for a header-only row. */
  cells: ReactNode[]
}

export function ColumnGridRow({ header, cells }: RowProps) {
  return (
    <section className="flex flex-col gap-1.5 rounded-lg bg-zinc-900/40 p-2">
      {header}
      {cells.length > 0 && (
        <div className={GRID} style={gridColumns(cells.length)}>
          {cells.map((cell, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-2">
              {cell}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function ColumnGridList({ children }: { children: ReactNode }) {
  return <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">{children}</div>
}
