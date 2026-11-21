import { useEffect, useMemo, useState } from 'react'
import { useBoardStore } from '../../state/boardStore'
import { isFeatureFilterOn, MINUTE_MS, nowBuilding, timeAgo, toggleFeatureFilter, type NowBuildingRow } from '../../state/nowBuilding'
import { useStatusesByWorkspace } from '../../state/sessionStatusStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { HeaderRow } from '../ui/HeaderRow'
import { ListRow, ListRowLabel, ListRowMeta, ListRowNote } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { ProgressBar } from '../ui/ProgressBar'
import { StatusTag } from '../ui/StatusDot'
import { Swimlane } from '../ui/Swimlane'

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function NowBuildingStrip() {
  const model = useBoardStore((s) => s.model)
  const open = useBoardStore((s) => s.nowBuildingOpen)
  const toggle = useBoardStore((s) => s.toggleNowBuilding)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const statuses = useStatusesByWorkspace()
  const now = useMinuteClock()
  const [showAll, setShowAll] = useState(false)

  const worktreeTags = useMemo(() => Object.fromEntries(workspaces.map((w) => [w.id, w.worktreeTag])), [workspaces])
  const strip = useMemo(() => nowBuilding({ model, statuses, worktreeTags, now }), [model, statuses, worktreeTags, now])

  if (strip.count === 0) return <NoticeLine>Nothing in progress</NoticeLine>

  const rows = showAll ? [...strip.rows, ...strip.hidden] : strip.rows
  return (
    <Swimlane
      label="Now building"
      header={
        <HeaderRow title="Now building">
          <Badge>{strip.count}</Badge>
        </HeaderRow>
      }
      open={open}
      onToggle={toggle}
    >
      <ul>
        {rows.map((row) => (
          <FeatureRow key={row.key} row={row} now={now} />
        ))}
      </ul>
      {strip.hidden.length > 0 && (
        <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `+${strip.hidden.length} more`}
        </Button>
      )}
    </Swimlane>
  )
}

function ticketsLabel(row: NowBuildingRow): string | null {
  const [first, ...rest] = row.inProgress
  if (!first) return null
  return `#${first.number} ${first.title}${rest.length > 0 ? ` +${rest.length}` : ''}`
}

function FeatureRow({ row, now }: { row: NowBuildingRow; now: number }) {
  const filter = useBoardStore((s) => s.filter)
  const setFilter = useBoardStore((s) => s.setFilter)
  const selected = isFeatureFilterOn(filter, row.key)
  const { done, total, lastNote } = row.feature.progress
  const tickets = ticketsLabel(row)

  return (
    <ListRow
      active={selected}
      onClick={() => setFilter(toggleFeatureFilter(filter, row.repoGroupKey, row.key))}
      tooltip={selected ? 'Show every feature' : `Show only ${row.featureName} on the board`}
    >
      <RepoIcon repoGroupKey={row.repoGroupKey} repoName={row.repoName} size="sm" />
      {row.worktreeTag && <Badge>{row.worktreeTag}</Badge>}
      <ListRowLabel>{row.featureName}</ListRowLabel>
      {total > 0 && <ProgressBar value={done} max={total} label={`${row.featureName}: ${done} of ${total} done`} />}
      {row.finished && <Badge>finished</Badge>}
      {tickets && (
        <ListRowLabel tone="secondary" tooltip={row.inProgress.map((t) => `#${t.number} ${t.title}`).join('\n')}>
          {tickets}
        </ListRowLabel>
      )}
      {row.status && <StatusTag status={row.status} />}
      <ListRowNote>{lastNote}</ListRowNote>
      {row.lastActivity !== null && <ListRowMeta>{timeAgo(row.lastActivity, now)}</ListRowMeta>}
    </ListRow>
  )
}
