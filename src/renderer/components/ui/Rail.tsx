import type { ReactNode } from 'react'

/** A thin vertical bar at the edge of a view, holding icon buttons; stands in for a hidden side panel. */
export function Rail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside aria-label={label} className="flex h-full w-7 shrink-0 flex-col items-center border-r border-subtle bg-sidebar pt-2">
      {children}
    </aside>
  )
}
