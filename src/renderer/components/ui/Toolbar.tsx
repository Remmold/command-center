import type { ReactNode } from 'react'

/** A pane's top bar: content on the left, actions on the right. */
export function Toolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3">
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  )
}
