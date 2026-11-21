import type { ReactNode } from 'react'

/** One slim line of information with an optional trailing action. */
export function NoticeLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 px-3 text-[11px] text-muted">
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </div>
  )
}
