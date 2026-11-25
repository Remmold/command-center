import type { ReactNode } from 'react'

type Tone = 'neutral' | 'warning' | 'waiting' | 'muted'

/** Never cut. */
const PILL = 'shrink-0 whitespace-nowrap rounded-full tabular-nums'

const TONES: Record<Tone, string> = {
  neutral: 'min-w-0 truncate rounded bg-list-selected text-muted',
  warning: 'min-w-0 truncate rounded bg-amber-500/15 text-amber-300',
  /** In the Needs-you amber. */
  waiting: `${PILL} bg-status-approval/15 font-medium text-status-approval`,
  muted: `${PILL} bg-list-selected text-muted`
}

interface Props {
  children: ReactNode
  tone?: Tone
  tooltip?: string
  /** Names the badge for screen readers where its text means nothing alone, e.g. a bare count inside a row. */
  label?: string
}

export function Badge({ children, tone = 'neutral', tooltip, label }: Props) {
  return (
    <span title={tooltip} role={label ? 'img' : undefined} aria-label={label} className={`px-1.5 py-px text-[10px] leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  )
}
