import { useEffect, useMemo } from 'react'
import { Ticket } from 'lucide-react'
import type { Workspace } from '../../../shared/types'
import { featureKey, refOf, type FoundTicket } from '../../state/boardLayout'
import { useBoardStore } from '../../state/boardStore'
import { useChatItemsStore } from '../../state/chatItemsStore'
import { currentTicket } from '../../state/currentTicket'
import { useViewStore } from '../../state/viewStore'
import { TicketStatusBadge } from '../board/TicketStatusBadge'
import { Button } from '../ui/Button'
import { SummaryStrip } from '../ui/SummaryStrip'

function openOnBoard({ group, feature, ticket }: FoundTicket): void {
  const board = useBoardStore.getState()
  board.showFeature(group.repoGroupKey, featureKey(group.repoGroupKey, feature.name), feature.state === 'finished' || ticket.column === 'done')
  board.select(refOf(group.repoGroupKey, feature, ticket))
  useViewStore.getState().setView('board')
}

/** The ticket the session last worked on, under its header; nothing until it touches one. */
export function CurrentTicketStrip({ workspace, paneId }: { workspace: Workspace; paneId: string }) {
  const initBoard = useBoardStore((s) => s.init)
  const model = useBoardStore((s) => s.model)
  const items = useChatItemsStore((s) => s.items[paneId])
  const found = useMemo(() => (items ? currentTicket(items, model, workspace.repoGroupKey) : null), [items, model, workspace.repoGroupKey])

  useEffect(() => {
    initBoard()
  }, [initBoard])

  if (!found) return null
  const { feature, ticket } = found
  return (
    <SummaryStrip
      label="Current ticket"
      icon={<Ticket size={13} strokeWidth={2} />}
      eyebrow={`${feature.name} #${ticket.number}`}
      title={ticket.title}
      text={ticket.summary}
    >
      <TicketStatusBadge ticket={ticket} />
      <Button variant="link" onClick={() => openOnBoard(found)} tooltip={ticket.sightings[0]?.filePath}>
        Open on Board
      </Button>
    </SummaryStrip>
  )
}
