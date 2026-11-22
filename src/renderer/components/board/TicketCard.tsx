import { memo } from 'react'
import type { Workspace } from '../../../shared/types'
import type { SpecOnlyBoardCard, TicketBoardCard } from '../../state/boardLayout'
import { useWorkspacesStatus } from '../../state/sessionStatusStore'
import { showsSessionStatus, statusRepeatsColumn } from '../../state/ticketPresentation'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Card, CardMeta, CardMetaText, CardNote, CardTitle } from '../ui/Card'
import { StatusDot } from '../ui/StatusDot'
import { statusText, TicketStatusBadge } from './TicketStatusBadge'

/** The worktree tag when no copy of the ticket sits in a main checkout. */
function onlyWorktreeTag(card: TicketBoardCard, workspaces: Map<string, Workspace>): string | null {
  const tags = card.ticket.sightings.map((s) => workspaces.get(s.workspaceId)?.worktreeTag ?? '')
  return tags.length > 0 && tags.every((t) => t !== '') ? tags[0] : null
}

export function cardAnchorId(cardKey: string): string {
  return `board-card:${cardKey}`
}

interface Props {
  card: TicketBoardCard
  workspaces: Map<string, Workspace>
  selected: boolean
  onOpen: (card: TicketBoardCard) => void
}

export const TicketCard = memo(function TicketCard({ card, workspaces, selected, onOpen }: Props) {
  const { ticket } = card
  const workspaceIds = ticket.sightings.map((s) => s.workspaceId)
  const status = useWorkspacesStatus(workspaceIds)
  const tag = onlyWorktreeTag(card, workspaces)
  const note = statusText(ticket)
  const copies = ticket.sightings.length

  const showStatus = !statusRepeatsColumn(ticket)
  const details = showStatus || card.blockers.length > 0

  return (
    <Card anchorId={cardAnchorId(card.key)} tooltip={ticket.sightings[0]?.filePath} onClick={() => onOpen(card)} selected={selected}>
      <CardMeta>
        <RepoIcon repoGroupKey={card.repoGroupKey} repoName={card.repoName} size="sm" />
        {tag && <Badge tooltip="Only seen in this worktree">{tag}</Badge>}
        <CardMetaText trailing={copies > 1 ? <span title="Seen in more than one worktree">{copies} copies</span> : undefined}>
          {card.feature.name} #{ticket.number}
        </CardMetaText>
        {status && showsSessionStatus(ticket.column) && <StatusDot status={status} />}
      </CardMeta>
      <CardTitle>{ticket.title}</CardTitle>
      {details && (
        <CardMeta>
          {showStatus && <TicketStatusBadge ticket={ticket} />}
          {card.blockers.length > 0 && <span className="truncate">blocked by {card.blockers.join(', ')}</span>}
        </CardMeta>
      )}
      {note && <CardNote>{note}</CardNote>}
    </Card>
  )
})

export function SpecOnlyCard({ card }: { card: SpecOnlyBoardCard }) {
  return (
    <Card muted tooltip={card.feature.sightings[0]?.specPath ?? undefined}>
      <CardMeta>
        <RepoIcon repoGroupKey={card.repoGroupKey} repoName={card.repoName} size="sm" />
        <span className="truncate">{card.feature.name} — spec only, no tickets yet</span>
      </CardMeta>
    </Card>
  )
}
