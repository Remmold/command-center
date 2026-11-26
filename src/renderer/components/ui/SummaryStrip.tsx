import type { ReactNode } from 'react'
import { Clamp } from './Clamp'

interface Props {
  /** Names the strip as a region. */
  label: string
  icon?: ReactNode
  title: string
  /** Before the title, dimmed: where the item lives. */
  eyebrow?: string
  /** After the title: badges, an action. */
  children?: ReactNode
  text?: string | null
  lines?: number
}

/** A full-width strip under a pane's header, ruled off below: one heading line, then a few lines of text that expand. */
export function SummaryStrip({ label, icon, title, eyebrow, children, text, lines = 2 }: Props) {
  return (
    <section aria-label={label} className="flex shrink-0 flex-col gap-1 border-b border-b-subtle px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <span title={title} className="min-w-0 truncate font-medium text-fg">
          {eyebrow && <span className="font-normal text-muted">{eyebrow} · </span>}
          {title}
        </span>
        {children}
      </div>
      {text && (
        <Clamp lines={lines}>
          <p className="text-[11px] text-muted">{text}</p>
        </Clamp>
      )}
    </section>
  )
}
