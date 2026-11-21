import type { ReactNode } from 'react'

/** A centred muted line filling an empty area. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-editor text-sm text-muted">{children}</div>
}
