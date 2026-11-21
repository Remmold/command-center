import type { ReactNode } from 'react'

export function SectionLabel({ children, as: Tag = 'span' }: { children: ReactNode; as?: 'span' | 'h2' | 'h3' }) {
  return <Tag className="text-[10px] font-semibold uppercase tracking-widest text-muted">{children}</Tag>
}
