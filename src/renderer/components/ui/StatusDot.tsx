import { OBSERVED_STATUS_LABEL, type ObservedStatus, type SessionStatus } from '../../../shared/types'
import { STATUS_LABEL } from '../../../shared/needsYou'

type DotStatus = SessionStatus | ObservedStatus

const TONE: Record<DotStatus, string> = {
  running: 'bg-status-running animate-pulse',
  'needs-approval': 'bg-status-approval',
  'your-turn': 'bg-status-turn',
  idle: 'bg-status-idle',
  live: 'bg-status-live animate-pulse',
  quiet: 'bg-status-quiet'
}

const LABEL: Record<DotStatus, string> = { ...STATUS_LABEL, ...OBSERVED_STATUS_LABEL }

const LOOK = { solid: 'h-1.5 w-1.5', soft: 'h-[5px] w-[5px] opacity-70' } as const

/** `tooltip` replaces the status name, e.g. where a past session is open; `soft` is the calmer dot of a roomy list. */
export function StatusDot({ status, tooltip, look = 'solid' }: { status: DotStatus; tooltip?: string; look?: keyof typeof LOOK }) {
  const label = tooltip ?? LABEL[status]
  return <span role="img" aria-label={label} title={label} className={`shrink-0 rounded-full ${LOOK[look]} ${TONE[status]}`} />
}

export function StatusTag({ status }: { status: DotStatus }) {
  return (
    <span title={LABEL[status]} className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
      <StatusDot status={status} />
      <span className="hide-in-narrow-header">{LABEL[status]}</span>
    </span>
  )
}
