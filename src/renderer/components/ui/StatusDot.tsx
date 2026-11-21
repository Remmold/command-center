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

export function StatusDot({ status }: { status: DotStatus }) {
  const label = LABEL[status]
  return <span role="img" aria-label={label} title={label} className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[status]}`} />
}
