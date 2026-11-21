import type { SessionStatus } from '../../../shared/types'
import { STATUS_LABEL } from '../../../shared/needsYou'

const TONE: Record<SessionStatus, string> = {
  running: 'bg-status-running animate-pulse',
  'needs-approval': 'bg-status-approval',
  'your-turn': 'bg-status-turn',
  idle: 'bg-status-idle'
}

export function StatusDot({ status }: { status: SessionStatus }) {
  const label = STATUS_LABEL[status]
  return <span role="img" aria-label={label} title={label} className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[status]}`} />
}
