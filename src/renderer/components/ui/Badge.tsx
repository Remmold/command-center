import type { ReactNode } from 'react'

type Tone = 'neutral' | 'warning' | 'count'

const TONES: Record<Tone, string> = {
  neutral: 'bg-list-selected text-muted',
  warning: 'bg-amber-500/15 text-amber-300',
  /** VS Code's activity badge: a number that asks for attention. */
  count: 'bg-accent font-semibold tabular-nums text-accent-fg'
}

interface Props {
  children: ReactNode
  tone?: Tone
  tooltip?: string
}

export function Badge({ children, tone = 'neutral', tooltip }: Props) {
  return (
    <span title={tooltip} className={`min-w-0 truncate rounded px-1.5 py-px text-[10px] leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  )
}
