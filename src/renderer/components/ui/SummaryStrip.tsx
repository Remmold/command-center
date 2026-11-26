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
  /** Makes the heading line a button. */
  onClick?: () => void
}

/** A full-width strip under a pane's header, ruled off below: one heading line, then a few lines of text that expand. */
export function SummaryStrip({ label, icon, title, eyebrow, children, text, lines = 2, onClick }: Props) {
  const heading = (
    <>
      {eyebrow && <span className="font-normal text-muted">{eyebrow} · </span>}
      {title}
    </>
  )
  return (
    <section aria-label={label} className="flex shrink-0 flex-col gap-1 border-b border-b-subtle px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        {onClick ? (
          <button type="button" title={title} onClick={onClick} className="min-w-0 flex-1 truncate text-left font-medium text-fg hover:underline">
            {heading}
          </button>
        ) : (
          <span title={title} className="min-w-0 truncate font-medium text-fg">
            {heading}
          </span>
        )}
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
