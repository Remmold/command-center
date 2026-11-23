import type { ReactNode } from 'react'

/** A fixed-width side bar beside the main content, VS Code style. */
export function SidebarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0">
      <aside className="scrollbar-thin flex w-56 shrink-0 flex-col overflow-y-auto border-r border-subtle bg-sidebar">
        {sidebar}
      </aside>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  )
}
