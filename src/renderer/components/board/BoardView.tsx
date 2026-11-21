import { useCallback, useEffect, useMemo } from 'react'
import type { Workspace } from '../../../shared/types'
import {
  cardKeyOf,
  COLUMN_TITLE,
  findTicket,
  layoutBoard,
  neighbourCard,
  type BoardCard,
  type BoardLane,
  type LaneColumn,
  type LaneHeader,
  type TicketBoardCard
} from '../../state/boardLayout'
import { PANEL_MIN_WIDTH, useBoardStore } from '../../state/boardStore'
import { useRepoDisplayName } from '../../state/repoIdentitiesStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { Button } from '../ui/Button'
import { Column, ColumnRow } from '../ui/Column'
import { DrawerHost, DrawerMain } from '../ui/Drawer'
import { HeaderRow } from '../ui/HeaderRow'
import { overlayOpen } from '../ui/overlay'
import { ProgressBar } from '../ui/ProgressBar'
import { ScrollStack } from '../ui/ScrollStack'
import { EmptyHint } from '../ui/Section'
import { Swimlane } from '../ui/Swimlane'
import { BoardToolbar } from './BoardToolbar'
import { NotAddedLine } from './NotAddedLine'
import { NowBuildingStrip } from './NowBuildingStrip'
import { cardAnchorId, SpecOnlyCard, TicketCard } from './TicketCard'
import { TicketDrawer } from './TicketDrawer'

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function BoardView() {
  const model = useBoardStore((s) => s.model)
  const init = useBoardStore((s) => s.init)
  const rescan = useBoardStore((s) => s.rescan)
  const filter = useBoardStore((s) => s.filter)
  const groupBy = useBoardStore((s) => s.groupBy)
  const showFinished = useBoardStore((s) => s.showFinished)
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const panelShare = useBoardStore((s) => s.panelShare)
  const setPanelShare = useBoardStore((s) => s.setPanelShare)
  const workspaces = useWorkspacesStore((s) => s.workspaces)

  useEffect(() => {
    init()
    rescan()
  }, [init, rescan])

  const layout = useMemo(() => layoutBoard(model, { filter, groupBy, showFinished }), [model, filter, groupBy, showFinished])
  const workspaceById = useMemo(() => new Map<string, Workspace>(workspaces.map((w) => [w.id, w])), [workspaces])
  const found = selected ? findTicket(model, selected) : null
  const closePanel = useCallback(() => select(null), [select])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || isTyping(e.target) || overlayOpen()) return
      const next = neighbourCard(layout, selected, e.key === 'ArrowUp' ? 'up' : 'down')
      if (!next) return
      e.preventDefault()
      select(next)
      document.getElementById(cardAnchorId(cardKeyOf(next)))?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout, selected, select])

  const selectedKey = selected ? cardKeyOf(selected) : null
  const lanes = (
    <BoardLanes layout={layout.lanes} grouped={groupBy !== 'none'} workspaces={workspaceById} selectedKey={selectedKey} />
  )

  return (
    <DrawerHost>
      <DrawerMain>
        <NowBuildingStrip />
        <NotAddedLine />
        <BoardToolbar model={model} />
        {model.repoGroups.length === 0 ? <EmptyHint>No tickets yet. Add a workspace that has a .scratch folder.</EmptyHint> : lanes}
      </DrawerMain>
      {found && (
        <TicketDrawer
          found={found}
          model={model}
          workspaces={workspaceById}
          onSelect={select}
          onClose={closePanel}
          share={panelShare}
          minWidth={PANEL_MIN_WIDTH}
          onResize={setPanelShare}
        />
      )}
    </DrawerHost>
  )
}

interface LanesProps {
  layout: BoardLane[]
  grouped: boolean
  workspaces: Map<string, Workspace>
  selectedKey: string | null
}

function BoardLanes({ layout, grouped, workspaces, selectedKey }: LanesProps) {
  const collapsed = useBoardStore((s) => s.collapsedLanes)
  const toggleLane = useBoardStore((s) => s.toggleLane)

  if (!grouped) {
    return <LaneColumns lane={layout[0]} scroll workspaces={workspaces} selectedKey={selectedKey} />
  }
  return (
    <ScrollStack>
      {layout.length === 0 && <EmptyHint>No tickets match.</EmptyHint>}
      {layout.map((lane) => (
        <Swimlane
          key={lane.key}
          label={lane.header?.featureName ?? lane.header?.repoName ?? lane.key}
          header={lane.header && <LaneTitle header={lane.header} />}
          open={!collapsed.includes(lane.key)}
          onToggle={() => toggleLane(lane.key)}
        >
          <LaneColumns lane={lane} scroll={false} workspaces={workspaces} selectedKey={selectedKey} />
        </Swimlane>
      ))}
    </ScrollStack>
  )
}

function LaneTitle({ header }: { header: LaneHeader }) {
  const displayName = useRepoDisplayName(header.repoGroupKey, header.repoName)
  const { done, total, lastNote } = header.progress
  const title = header.featureName ?? displayName
  return (
    <HeaderRow
      icon={<RepoIcon repoGroupKey={header.repoGroupKey} repoName={header.repoName} size="sm" />}
      subtitle={header.featureName ? displayName : undefined}
      title={title}
      note={lastNote}
    >
      {total > 0 && <ProgressBar value={done} max={total} label={`${title}: ${done} of ${total} done`} />}
    </HeaderRow>
  )
}

interface LaneColumnsProps {
  lane: BoardLane
  scroll: boolean
  workspaces: Map<string, Workspace>
  selectedKey: string | null
}

function LaneColumns({ lane, scroll, workspaces, selectedKey }: LaneColumnsProps) {
  return (
    <ColumnRow fill={scroll}>
      {lane.columns.map((column) => (
        <Column
          key={column.column}
          title={COLUMN_TITLE[column.column]}
          count={column.cards.length}
          scroll={scroll}
          footer={<FinishedLine column={column} />}
        >
          {column.cards.map((card) => (
            <CardView key={card.key} card={card} workspaces={workspaces} selected={card.key === selectedKey} />
          ))}
        </Column>
      ))}
    </ColumnRow>
  )
}

function CardView({ card, workspaces, selected }: { card: BoardCard; workspaces: Map<string, Workspace>; selected: boolean }) {
  const select = useBoardStore((s) => s.select)
  const open = useCallback((c: TicketBoardCard) => select(c.ref), [select])
  if (card.kind === 'spec-only') return <SpecOnlyCard card={card} />
  return <TicketCard card={card} workspaces={workspaces} selected={selected} onOpen={open} />
}

function FinishedLine({ column }: { column: LaneColumn }) {
  const showFinished = useBoardStore((s) => s.showFinished)
  const toggle = useBoardStore((s) => s.toggleShowFinished)
  const { cards, features } = column.finished
  if (cards === 0) return null
  const from = `${cards} from ${features} finished ${features === 1 ? 'feature' : 'features'}`
  return (
    <Button variant="ghost" onClick={toggle}>
      {showFinished ? `Hide ${from}` : `+${from} · show`}
    </Button>
  )
}
