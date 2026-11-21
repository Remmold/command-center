import type { BoardTicket, Workspace } from '../../../shared/types'
import { worktreeLabel } from '../../state/boardLayout'
import { useWorkspacesStatus } from '../../state/sessionStatusStore'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Card, CardMeta, CardTitle } from '../ui/Card'
import { StatusDot } from '../ui/StatusDot'

interface SeenIn {
  workspaceId: string
  tag: string
}

/** Empty when the only copy is in a main checkout, so plain repos show no tags. */
function seenIn(ticket: BoardTicket, workspaces: Map<string, Workspace>): SeenIn[] {
  if (ticket.sightings.length === 1 && !workspaces.get(ticket.sightings[0].workspaceId)?.worktreeTag) return []
  return ticket.sightings.map((s) => ({ workspaceId: s.workspaceId, tag: worktreeLabel(workspaces.get(s.workspaceId)) }))
}

interface Props {
  repoGroupKey: string
  repoName: string
  featureName: string
  ticket: BoardTicket
  workspaces: Map<string, Workspace>
  selected: boolean
  onOpen: () => void
}

export function TicketCard({ repoGroupKey, repoName, featureName, ticket, workspaces, selected, onOpen }: Props) {
  const status = useWorkspacesStatus(ticket.sightings.map((s) => s.workspaceId))
  return (
    <Card tooltip={ticket.sightings[0]?.filePath} onClick={onOpen} selected={selected}>
      <CardMeta>
        <RepoIcon repoGroupKey={repoGroupKey} repoName={repoName} size="sm" />
        <span className="min-w-0 flex-1 truncate">{featureName}</span>
        {status && <StatusDot status={status} />}
      </CardMeta>
      <CardTitle prefix={ticket.number}>{ticket.title}</CardTitle>
      <CardMeta>
        <Badge>{ticket.status ?? 'no status'}</Badge>
        {seenIn(ticket, workspaces).map(({ workspaceId, tag }) => (
          <Badge key={workspaceId}>{tag}</Badge>
        ))}
      </CardMeta>
    </Card>
  )
}
