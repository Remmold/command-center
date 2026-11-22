import type { ReactNode } from 'react'

/** A thin horizontal rule with a small centred label, e.g. a date line between messages. */
export function LabeledDivider({ children }: { children: ReactNode }) {
  return (
    <div role="separator" className="flex items-center gap-3 py-1 text-[11px] text-faint">
      <span className="flex-1 border-t border-subtle" />
      <span className="shrink-0">{children}</span>
      <span className="flex-1 border-t border-subtle" />
    </div>
  )
}
