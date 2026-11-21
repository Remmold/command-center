import { useEffect, useMemo } from 'react'
import type { BoardColumn, BoardModel, BoardTicket, Workspace } from '../../../shared/types'
import { useBoardStore } from '../../state/boardStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { Column, ColumnRow } from '../ui/Column'
import { Card, CardMeta, CardTitle } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { RepoIcon } from '../RepoIcon'

const COLUMNS: { column: BoardColumn; title: string }[] = [
  { column: 'backlog', title: 'Backlog' },
  { column: 'blocked', title: 'Blocked' },
  { column: 'in-progress', title: 'In progress' },
  { column: 'done', title: 'Done' }
]

interface PlacedTicket {
  key: string
  repoGroupKey: string
  repoName: string
  featureName: string
  ticket: BoardTicket
}

function placeTickets(model: BoardModel): Record<BoardColumn, PlacedTicket[]> {
  const byColumn: Record<BoardColumn, PlacedTicket[]> = { backlog: [], blocked: [], 'in-progress': [], done: [] }
  for (const group of model.repoGroups) {
    for (const feature of group.features) {
      for (const ticket of feature.tickets) {
        byColumn[ticket.column].push({
          key: `${group.repoGroupKey}/${feature.name}/${ticket.number}`,
          repoGroupKey: group.repoGroupKey,
          repoName: group.repoName,
          featureName: feature.name,
          ticket
        })
      }
    }
  }
  return byColumn
}

interface SeenIn {
  workspaceId: string
  tag: string
}

function seenIn(ticket: BoardTicket, workspaces: Map<string, Workspace>): SeenIn[] {
  const seen = ticket.sightings.map((s) => ({
    workspaceId: s.workspaceId,
    tag: workspaces.get(s.workspaceId)?.worktreeTag || 'main'
  }))
  return seen.length === 1 && seen[0].tag === 'main' ? [] : seen
}

export function BoardView() {
  const model = useBoardStore((s) => s.model)
  const init = useBoardStore((s) => s.init)
  const workspaces = useWorkspacesStore((s) => s.workspaces)

  useEffect(() => {
    init()
  }, [init])

  const byColumn = useMemo(() => placeTickets(model), [model])
  const workspaceById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces])

  return (
    <ColumnRow>
      {COLUMNS.map(({ column, title }) => (
        <Column key={column} title={title} count={byColumn[column].length}>
          {byColumn[column].map((placed) => (
            <TicketCard key={placed.key} placed={placed} tags={seenIn(placed.ticket, workspaceById)} />
          ))}
        </Column>
      ))}
    </ColumnRow>
  )
}

function TicketCard({ placed, tags }: { placed: PlacedTicket; tags: SeenIn[] }) {
  const { ticket } = placed
  return (
    <Card tooltip={ticket.sightings[0]?.filePath}>
      <CardMeta>
        <RepoIcon repoGroupKey={placed.repoGroupKey} repoName={placed.repoName} size="sm" />
        <span className="truncate">{placed.featureName}</span>
      </CardMeta>
      <CardTitle prefix={ticket.number}>{ticket.title}</CardTitle>
      <CardMeta>
        <Badge>{ticket.status ?? 'no status'}</Badge>
        {tags.map(({ workspaceId, tag }) => (
          <Badge key={workspaceId}>{tag}</Badge>
        ))}
      </CardMeta>
    </Card>
  )
}
