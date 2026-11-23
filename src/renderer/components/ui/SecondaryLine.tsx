import type { ReactNode } from 'react'

const LINE = 'my-0.5 flex w-full items-start gap-1 text-left text-[0.85em] text-muted opacity-70'

/** The extension's `secondaryLine`: a small, dim line under a card; with `onClick` it is a link-like button. */
export function SecondaryLine({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (!onClick) return <div className={LINE}>{children}</div>
  return (
    <button type="button" onClick={onClick} className={`${LINE} group focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus`}>
      <span className="group-hover:underline">{children}</span>
    </button>
  )
}
