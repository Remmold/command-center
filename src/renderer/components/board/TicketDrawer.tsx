import { useEffect, useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import type { BoardFeature, BoardModel, BoardTicket, Workspace } from '../../../shared/types'
import { COLUMN_TITLE, refOf, worktreeLabel, type FoundTicket, type TicketRef } from '../../state/boardLayout'
import { openWorkspace } from '../../state/sessionNavigation'
import { RepoIcon, RepoName } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CardMeta, CardMetaText, CardTitle } from '../ui/Card'
import { Drawer, DrawerList, DrawerSection } from '../ui/Drawer'
import { ListItem, ListRow, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Markdown } from '../ui/Markdown'
import { EmptyHint } from '../ui/Section'
import { statusRepeatsColumn, ticketBody } from '../../state/ticketPresentation'
import { statusText, TicketStatusBadge } from './TicketStatusBadge'

/** undefined while loading; re-reads whenever the board model changes so the drawer follows edits on disk. */
function useBoardFile(path: string | null, model: BoardModel): string | null | undefined {
  const [loaded, setLoaded] = useState<{ path: string; text: string | null } | null>(null)
  useEffect(() => {
    if (path === null) return
    let live = true
    window.api.board
      .readFile(path)
      .then((text) => live && setLoaded({ path, text }))
      .catch(() => live && setLoaded({ path, text: null }))
    return () => {
      live = false
    }
  }, [path, model])
  if (path === null) return null
  return loaded?.path === path ? loaded.text : undefined
}

interface Props {
  found: FoundTicket
  model: BoardModel
  workspaces: Map<string, Workspace>
  onSelect: (ref: TicketRef) => void
  onClose: () => void
  share: number
  minWidth: number
  onResize: (share: number) => void
}

export function TicketDrawer({ found, model, workspaces, onSelect, onClose, share, minWidth, onResize }: Props) {
  const { group, feature, ticket } = found
  const notesPath = ticket.sightings.find((s) => s.progressPath !== null)?.progressPath ?? null
  const ticketText = useBoardFile(ticket.sightings[0]?.filePath ?? null, model)
  const notesText = useBoardFile(notesPath, model)
  const note = statusText(ticket)

  return (
    <Drawer
      label="Ticket"
      onClose={onClose}
      share={share}
      minWidth={minWidth}
      onResize={onResize}
      title={
        <>
          <CardMeta>
            <RepoIcon repoGroupKey={group.repoGroupKey} repoName={group.repoName} size="sm" />
            <span className="truncate">
              <RepoName repoGroupKey={group.repoGroupKey} repoName={group.repoName} /> / {feature.name}
            </span>
          </CardMeta>
          <CardTitle prefix={`#${ticket.number}`}>{ticket.title}</CardTitle>
          <CardMeta>
            <Badge>{COLUMN_TITLE[ticket.column]}</Badge>
            {!statusRepeatsColumn(ticket) && <TicketStatusBadge ticket={ticket} />}
            {note && <CardMetaText>{note}</CardMetaText>}
          </CardMeta>
        </>
      }
    >
      <BlockersSection ticket={ticket} feature={feature} onSelect={(t) => onSelect(refOf(group.repoGroupKey, feature, t))} />
      <DrawerSection title="Seen in">
        <DrawerList>
          {ticket.sightings.map((s) => {
            const workspace = workspaces.get(s.workspaceId)
            return (
              <ListItem key={s.workspaceId} tooltip={s.filePath}>
                <ListRowText primary={workspace?.name ?? 'Worktree (not added)'} secondary={worktreeLabel(s.worktreeTag)} />
                {ticket.sightings.length > 1 && <Badge>{COLUMN_TITLE[s.column]}</Badge>}
                {workspace && (
                  <Button onClick={() => openWorkspace(workspace)} tooltip={`Switch to Sessions on ${workspace.name}`}>
                    <SquareTerminal size={12} />
                    Open session
                  </Button>
                )}
              </ListItem>
            )
          })}
        </DrawerList>
      </DrawerSection>
      <DrawerSection title="Ticket">
        <FileBody text={ticketText && ticketBody(ticketText)} />
      </DrawerSection>
      {notesPath && (
        <DrawerSection title="Progress notes">
          <FileBody text={notesText} />
        </DrawerSection>
      )}
    </Drawer>
  )
}

function FileBody({ text }: { text: string | null | undefined }) {
  if (text === undefined) return <EmptyHint>Loading…</EmptyHint>
  if (text === null) return <EmptyHint>File not found.</EmptyHint>
  return <Markdown text={text} />
}

interface BlockersProps {
  ticket: BoardTicket
  feature: BoardFeature
  onSelect: (ticket: BoardTicket) => void
}

function BlockersSection({ ticket, feature, onSelect }: BlockersProps) {
  const numbers = [...new Set(ticket.sightings.flatMap((s) => s.blockedBy))]
  if (numbers.length === 0) return null
  return (
    <DrawerSection title="Blocked by">
      <DrawerList>
        {numbers.flatMap((n) => {
          const matches = feature.tickets.filter((t) => t.number === n)
          if (matches.length === 0) {
            return [
              <ListItem key={n}>
                <ListRowText primary={n} secondary="not in this feature" />
              </ListItem>
            ]
          }
          return matches.map((t) => (
            <ListRow key={t.fileName} onClick={() => onSelect(t)} tooltip={t.fileName}>
              <ListRowText primary={`#${t.number} ${t.title}`} />
              <ListRowMeta>{COLUMN_TITLE[t.column]}</ListRowMeta>
            </ListRow>
          ))
        })}
      </DrawerList>
    </DrawerSection>
  )
}
