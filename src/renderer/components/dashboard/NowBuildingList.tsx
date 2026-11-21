import { useState } from 'react'
import { timeAgo, type NowBuilding, type NowBuildingRow } from '../../state/nowBuilding'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ListRow, ListRowLabel, ListRowMeta, ListRowNote } from '../ui/ListRow'
import { ProgressBar } from '../ui/ProgressBar'
import { StatusTag } from '../ui/StatusDot'

interface Props {
  building: NowBuilding
  now: number
  onOpen: (row: NowBuildingRow) => void
}

export function NowBuildingList({ building, now, onOpen }: Props) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? [...building.rows, ...building.hidden] : building.rows
  return (
    <>
      <ul>
        {rows.map((row) => (
          <FeatureRow key={row.key} row={row} now={now} onOpen={() => onOpen(row)} />
        ))}
      </ul>
      {building.hidden.length > 0 && (
        <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `+${building.hidden.length} more`}
        </Button>
      )}
    </>
  )
}

function ticketsLabel(row: NowBuildingRow): string | null {
  const [first, ...rest] = row.inProgress
  if (!first) return null
  return `#${first.number} ${first.title}${rest.length > 0 ? ` +${rest.length}` : ''}`
}

function FeatureRow({ row, now, onOpen }: { row: NowBuildingRow; now: number; onOpen: () => void }) {
  const { done, total, lastNote } = row.feature.progress
  const tickets = ticketsLabel(row)

  return (
    <ListRow onClick={onOpen} tooltip={`Show ${row.featureName} on the board`}>
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
