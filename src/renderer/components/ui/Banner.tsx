import type { ReactNode } from 'react'

/** A boxed notice spanning its column, with actions on the right; `label` names it as a region. */
export function Banner({ children, actions, label }: { children: ReactNode; actions?: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="flex items-center justify-between gap-3 rounded-md border border-subtle bg-sidebar px-3 py-2 text-xs text-fg">
      <p className="min-w-0 break-words">{children}</p>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </section>
  )
}
