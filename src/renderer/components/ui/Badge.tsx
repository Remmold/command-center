import type { ReactNode } from 'react'

type Tone = 'neutral' | 'warning' | 'waiting' | 'quiet' | 'quiet-warning'

const TONES: Record<Tone, string> = {
  neutral: 'min-w-0 truncate rounded bg-list-selected text-muted',
  warning: 'min-w-0 truncate rounded bg-amber-500/15 text-amber-300',
  /** In the Needs-you amber; never cut. */
  waiting: 'shrink-0 whitespace-nowrap rounded-full bg-status-approval/15 font-medium tabular-nums text-status-approval',
  /** Outlined, for a note on a dense row that must not compete with its label. */
  quiet: 'min-w-0 truncate rounded border border-subtle text-faint',
  'quiet-warning': 'min-w-0 truncate rounded border border-warning/30 text-warning/80'
}

interface Props {
  children: ReactNode
  tone?: Tone
  tooltip?: string
}

export function Badge({ children, tone = 'neutral', tooltip }: Props) {
  return (
    <span title={tooltip} className={`px-1.5 py-px text-[10px] leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  )
}
