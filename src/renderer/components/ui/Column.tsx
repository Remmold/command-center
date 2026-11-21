import type { ReactNode } from 'react'
import { SectionLabel } from './SectionLabel'

/** Columns side by side; `fill` makes them take the full height and scroll each on its own. */
export function ColumnRow({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return (
    <div className={`grid min-w-0 grid-cols-4 gap-2 ${fill ? 'min-h-0 flex-1 px-3' : ''}`}>{children}</div>
  )
}

interface Props {
  title: string
  count: number
  children: ReactNode
  /** Shown under the cards, e.g. a "show more" line. */
  footer?: ReactNode
  /** False inside a swimlane, where the whole board scrolls instead. */
  scroll?: boolean
}

export function Column({ title, count, children, footer, scroll = true }: Props) {
  return (
    <section aria-label={title} className={`flex min-w-0 flex-col rounded-lg bg-sidebar/40 ${scroll ? 'min-h-0' : ''}`}>
      <ColumnHeader title={title} count={count} />
      <div className={`flex flex-col gap-2 p-2 ${scroll ? 'scrollbar-thin min-h-0 flex-1 overflow-y-auto' : ''}`}>
        {children}
        {footer}
      </div>
    </section>
  )
}

function ColumnHeader({ title, count }: { title: string; count: number }) {
  return (
    <header className="flex shrink-0 items-center justify-between px-3 pt-2">
      <SectionLabel as="h2">{title}</SectionLabel>
      <span className="text-[10px] tabular-nums text-muted">{count}</span>
    </header>
  )
}
