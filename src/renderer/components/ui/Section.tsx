import type { ReactNode } from 'react'

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="shrink-0 border-b border-subtle pb-1">
      {children}
    </section>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 text-xs text-faint">{children}</p>
}
