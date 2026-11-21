import { useCallback, useEffect, useMemo } from 'react'
import type { BoardModel, Workspace } from '../../../shared/types'
import {
  COLUMNS,
  findTicket,
  layoutBoard,
  refOf,
  sameTicket,
  worktreeLabel,
  type BoardFilter,
  type PlacedFeature
} from '../../state/boardLayout'
import { useBoardStore } from '../../state/boardStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon, RepoName } from '../RepoIcon'
import { Chip, ChipBar, ChipRow } from '../ui/Chip'
import { Collapsible } from '../ui/Collapsible'
import { ColumnGridHeader, ColumnGridList, ColumnGridRow } from '../ui/ColumnGrid'
import { DrawerHost } from '../ui/Drawer'
import { EmptyHint } from '../ui/Section'
import { FeatureHeader } from './FeatureHeader'
import { NotAddedStrip } from './NotAddedStrip'
import { ScanRootsButton } from './ScanRootsButton'
import { TicketCard } from './TicketCard'
import { TicketDrawer } from './TicketDrawer'

export function BoardView() {
  const model = useBoardStore((s) => s.model)
  const init = useBoardStore((s) => s.init)
  const filter = useBoardStore((s) => s.filter)
  const selected = useBoardStore((s) => s.selected)
  const finishedOpen = useBoardStore((s) => s.finishedOpen)
  const select = useBoardStore((s) => s.select)
  const toggleFinished = useBoardStore((s) => s.toggleFinished)
  const rescan = useBoardStore((s) => s.rescan)
  const workspaces = useWorkspacesStore((s) => s.workspaces)

  useEffect(() => {
    init()
    rescan()
  }, [init, rescan])

  const layout = useMemo(() => layoutBoard(model, filter), [model, filter])
  const workspaceById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces])
  const found = selected ? findTicket(model, selected) : null
  const closeDrawer = useCallback(() => select(null), [select])

  return (
    <DrawerHost>
      <BoardFilters model={model} filter={filter} workspaces={workspaces} />
      <NotAddedStrip />
      <ColumnGridHeader columns={COLUMNS.map(({ column, title }) => ({ title, count: layout.counts[column] }))} />
      <ColumnGridList>
        {layout.rows.length === 0 && layout.finished.length === 0 && <EmptyHint>No features here yet.</EmptyHint>}
        {layout.rows.map((placed) => (
          <FeatureRow key={placed.key} placed={placed} workspaces={workspaceById} />
        ))}
        {layout.finished.length > 0 && (
          <Collapsible title="Finished features" count={layout.finished.length} open={finishedOpen} onToggle={toggleFinished}>
            {layout.finished.map((p) => (
              <FeatureHeader key={p.key} repoGroupKey={p.repoGroupKey} repoName={p.repoName} feature={p.feature} />
            ))}
          </Collapsible>
        )}
      </ColumnGridList>
      {found && (
        <TicketDrawer found={found} model={model} workspaces={workspaceById} onSelect={select} onClose={closeDrawer} />
      )}
    </DrawerHost>
  )
}

function FeatureRow({ placed, workspaces }: { placed: PlacedFeature; workspaces: Map<string, Workspace> }) {
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const cells =
    placed.tickets.length === 0
      ? []
      : COLUMNS.map(({ column }) =>
          placed.tickets
            .filter((t) => t.column === column)
            .map((ticket) => {
              const ref = refOf(placed.repoGroupKey, placed.feature, ticket)
              return (
                <TicketCard
                  key={ticket.fileName}
                  repoGroupKey={placed.repoGroupKey}
                  repoName={placed.repoName}
                  featureName={placed.feature.name}
                  ticket={ticket}
                  workspaces={workspaces}
                  selected={sameTicket(selected, ref)}
                  onOpen={() => select(ref)}
                />
              )
            })
        )
  return (
    <ColumnGridRow
      header={<FeatureHeader repoGroupKey={placed.repoGroupKey} repoName={placed.repoName} feature={placed.feature} />}
      cells={cells}
    />
  )
}

interface FiltersProps {
  model: BoardModel
  filter: BoardFilter
  workspaces: Workspace[]
}

function BoardFilters({ model, filter, workspaces }: FiltersProps) {
  const filterRepoGroup = useBoardStore((s) => s.filterRepoGroup)
  const filterWorkspace = useBoardStore((s) => s.filterWorkspace)
  const groupWorkspaces = filter.repoGroupKey ? workspaces.filter((w) => w.repoGroupKey === filter.repoGroupKey) : []

  return (
    <ChipBar>
      <ChipRow label="Filter by repo">
        <ScanRootsButton />
        <Chip selected={filter.repoGroupKey === null} onClick={() => filterRepoGroup(null)}>
          All repos
        </Chip>
        {model.repoGroups.map((g) => (
          <Chip
            key={g.repoGroupKey}
            selected={filter.repoGroupKey === g.repoGroupKey}
            onClick={() => filterRepoGroup(filter.repoGroupKey === g.repoGroupKey ? null : g.repoGroupKey)}
          >
            <RepoIcon repoGroupKey={g.repoGroupKey} repoName={g.repoName} size="sm" />
            <RepoName repoGroupKey={g.repoGroupKey} repoName={g.repoName} />
          </Chip>
        ))}
      </ChipRow>
      {groupWorkspaces.length > 1 && (
        <ChipRow label="Filter by workspace">
          <Chip selected={filter.workspaceId === null} onClick={() => filterWorkspace(null)}>
            All workspaces
          </Chip>
          {groupWorkspaces.map((w) => (
            <Chip
              key={w.id}
              selected={filter.workspaceId === w.id}
              tooltip={w.path}
              onClick={() => filterWorkspace(filter.workspaceId === w.id ? null : w.id)}
            >
              {worktreeLabel(w)}
            </Chip>
          ))}
        </ChipRow>
      )}
    </ChipBar>
  )
}
