import type { ReactNode } from 'react'

/** A titled run of list rows, headed like a VS Code side bar section. */
export function ListGroup({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="flex h-[22px] items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wide text-muted">
        {title}
        {count !== undefined && <span className="font-normal tabular-nums text-faint">{count}</span>}
      </h3>
      <ul>{children}</ul>
    </section>
  )
}
