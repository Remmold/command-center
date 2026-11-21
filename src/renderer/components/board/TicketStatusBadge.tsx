import type { TicketStatus } from '../../../shared/types'
import { Badge } from '../ui/Badge'

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  if (status.status === null) return <Badge>no status</Badge>
  if (!status.statusKnown) {
    return (
      <Badge tone="warning" tooltip={`Status: ${status.statusLine ?? ''}`}>
        unknown status: {status.status}
      </Badge>
    )
  }
  return <Badge>{status.status}</Badge>
}
