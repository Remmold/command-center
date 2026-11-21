import type { ReactNode } from 'react'

/** A full-height page: a header over a scrolling body. */
export function Page({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 min-w-0 flex-col bg-editor">
      {children}
    </section>
  )
}

interface HeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-subtle px-5 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-fg">{title}</h1>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">{children}</div>
}

/** A titled block of related rows inside a PageBody. */
interface GroupProps {
  title: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export function PageGroup({ title, icon, actions, children }: GroupProps) {
  return (
    <section aria-label={title} className="flex max-w-3xl flex-col gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Muted secondary prose under a group or row. */
export function PageNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
