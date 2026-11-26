import type { ReactNode } from 'react'

interface Props {
  /** Names the bar as a region. */
  label: string
  summary: string
  error?: string | null
  actions: ReactNode
}

/** A strip along a page's bottom edge for changes that wait to be saved, with their count and actions. */
export function SaveBar({ label, summary, error, actions }: Props) {
  return (
    <section aria-label={label} className="flex shrink-0 items-center gap-3 border-t border-subtle bg-sidebar px-5 py-2 text-xs">
      <span className="shrink-0 text-fg">{summary}</span>
      <span role="alert" className="min-w-0 flex-1 truncate text-error" title={error ?? undefined}>
        {error}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </section>
  )
}
