import type { ReactNode } from 'react'

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{title}</span>
      {children}
    </div>
  )
}
