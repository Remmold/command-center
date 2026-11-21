import type { TicketStatus } from '../../../shared/types'
import { Badge } from '../ui/Badge'

/** The raw line of an unknown status is shown by the caller, through statusText. */
export function TicketStatusBadge({ ticket }: { ticket: TicketStatus }) {
  if (ticket.status === null) return <Badge>no status</Badge>
  if (!ticket.statusKnown) {
    return (
      <Badge tone="warning" tooltip={`Status: ${ticket.statusLine ?? ''}`}>
        unknown status
      </Badge>
    )
  }
  return <Badge>{ticket.status}</Badge>
}

/** What shows under a ticket's title: its note, or the whole line when the word is unknown. */
export function statusText(ticket: TicketStatus): string | null {
  return ticket.statusKnown ? ticket.statusNote : ticket.statusLine
}
