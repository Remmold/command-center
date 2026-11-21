import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  actions?: ReactNode
  /** Marks the pane that has focus when two sit side by side; leave unset for a pane that is never split. */
  highlighted?: boolean
}

function topEdge(highlighted: boolean | undefined): string {
  if (highlighted === undefined) return ''
  return highlighted ? 'border-t border-t-focus' : 'border-t border-t-transparent'
}

/** A pane's top bar: content on the left, actions on the right. */
export function Toolbar({ children, actions, highlighted }: Props) {
  return (
    <div className={`flex h-9 shrink-0 items-center justify-between gap-2 border-b border-b-subtle px-3 ${topEdge(highlighted)}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  )
}
