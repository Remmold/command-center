import type { ReactNode } from 'react'

/** A vertical stack that fills the remaining height and scrolls. */
export function ScrollStack({ children }: { children: ReactNode }) {
  return <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3">{children}</div>
}
