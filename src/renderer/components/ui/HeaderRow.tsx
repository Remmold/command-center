import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  title: string
  subtitle?: string
  /** Shown after the title: badges, a progress bar. */
  children?: ReactNode
  note?: string | null
}

export function HeaderRow({ icon, title, subtitle, children, note }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-1 text-xs">
      {icon}
      <span className="shrink-0 font-medium text-fg">
        {subtitle && <span className="font-normal text-muted">{subtitle} / </span>}
        {title}
      </span>
      {children}
      {note && (
        <span title={note} className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {note}
        </span>
      )}
    </div>
  )
}
