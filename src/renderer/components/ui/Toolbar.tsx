import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  actions?: ReactNode
  /** Marks the pane that has focus when two sit side by side; leave unset for a pane that is never split. */
  highlighted?: boolean
  /** The slimmer height of a pane's notice strip, so two panes side by side line up. */
  compact?: boolean
  /** Lets the actions go onto a second line when the bar is too narrow for both, instead of over the content. */
  wrap?: boolean
}

function topEdge(highlighted: boolean | undefined): string {
  if (highlighted === undefined) return ''
  return highlighted ? 'border-t border-t-focus' : 'border-t border-t-transparent'
}

/** A pane's top bar: content on the left, actions on the right. */
export function Toolbar({ children, actions, highlighted, compact = false, wrap = false }: Props) {
  const height = compact ? 'h-8 px-2' : 'h-9 px-3'
  return (
    <div className={`flex shrink-0 items-center justify-between gap-2 border-b border-b-subtle ${wrap ? 'min-h-9 flex-wrap px-3 py-1' : height} ${topEdge(highlighted)}`}>
      <div className={wrap ? 'min-w-0' : 'min-w-0 flex-1'}>{children}</div>
      {actions}
    </div>
  )
}
