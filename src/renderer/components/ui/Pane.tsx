import type { ReactNode } from 'react'

export function Pane({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 flex-col bg-editor">
      {children}
    </section>
  )
}
