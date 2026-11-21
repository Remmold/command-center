import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  count: number
  /** Shown in place of the children while count is 0. */
  empty: string
  /** Frames the children on a widget surface. */
  boxed?: boolean
  children: ReactNode
}

/** A titled block of a page, headed like a VS Code side bar section. */
export function Panel({ title, count, empty, boxed = false, children }: PanelProps) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1.5">
      <h2 className="flex h-[22px] items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        {title}
        {count > 0 && <span className="font-normal tabular-nums text-faint">{count}</span>}
      </h2>
      {count === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : boxed ? (
        <div className="min-w-0 overflow-hidden rounded-md border border-subtle bg-widget py-1">{children}</div>
      ) : (
        children
      )}
    </section>
  )
}

export function PanelColumns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] items-start gap-5">
      {main}
      {side}
    </div>
  )
}

