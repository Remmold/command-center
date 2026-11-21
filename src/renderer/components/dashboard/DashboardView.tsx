import { useEffect } from 'react'
import { OBSERVED_STATUS_LABEL } from '../../../shared/types'
import { STATUS_LABEL } from '../../../shared/needsYou'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { useBoardStore } from '../../state/boardStore'
import type { LiveCard } from '../../state/dashboard'
import { elapsed, timeAgo, type NowBuildingRow } from '../../state/nowBuilding'
import { openSession } from '../../state/sessionNavigation'
import type { HostedRow, SessionRow } from '../../state/sessionList'
import { useDashboard } from '../../state/useDashboard'
import { formatResetTime, formatTokens } from '../../state/usageStore'
import type { UsageBar } from '../../state/usageModel'
import { useViewStore } from '../../state/viewStore'
import { openRow } from '../../state/workSessions'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Card, CardGrid, CardMeta, CardMetaText, CardNote, CardTitle } from '../ui/Card'
import { ListRow, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Meter } from '../ui/Meter'
import { Page, PageBody } from '../ui/Page'
import { Panel, PanelColumns } from '../ui/Panel'
import { StatRow } from '../ui/StatRow'
import { StatusTag } from '../ui/StatusDot'
import { NowBuildingList } from './NowBuildingList'

function openOnBoard(row: NowBuildingRow): void {
  useBoardStore.getState().showFeature(row.repoGroupKey, row.key, row.finished)
  useViewStore.getState().setView('board')
}

export function DashboardView() {
  const initBoard = useBoardStore((s) => s.init)
  const now = useMinuteClock()
  const dash = useDashboard(now)

  useEffect(() => {
    initBoard()
  }, [initBoard])

  return (
    <Page label="Dashboard">
      <PageBody>
        <Panel title="Needs you" count={dash.needsYou.length} empty="Nobody is waiting on you" boxed>
          <ul>
            {dash.needsYou.map((row) => (
              <NeedsYouRow key={row.key} row={row} now={now} />
            ))}
          </ul>
        </Panel>
        <PanelColumns
          main={
            <Panel title="Now building" count={dash.nowBuilding.count} empty="Nothing in progress" boxed>
              <NowBuildingList building={dash.nowBuilding} now={now} onOpen={openOnBoard} />
            </Panel>
          }
          side={
            <Panel title="Usage per account" count={dash.usage.length} empty="No usage yet" boxed>
              <ul>
                {dash.usage.map((bar) => (
                  <UsageRow key={bar.profileId} bar={bar} />
                ))}
              </ul>
            </Panel>
          }
        />
        <Panel title="Live sessions" count={dash.live.length} empty="No live sessions">
          <CardGrid label="Live sessions">
            {dash.live.map((card) => (
              <LiveSessionCard key={card.row.key} card={card} now={now} />
            ))}
          </CardGrid>
        </Panel>
      </PageBody>
    </Page>
  )
}

function WorktreeTag({ row }: { row: SessionRow }) {
  return row.workspace.worktreeTag ? <Badge>{row.workspace.worktreeTag}</Badge> : null
}

function NeedsYouRow({ row, now }: { row: HostedRow; now: number }) {
  const waited = elapsed(row.statusSince, now)
  return (
    <ListRow onClick={() => openSession(row.paneId)} tooltip={`${row.title} · ${row.repoName} · ${STATUS_LABEL[row.status]}`}>
      <RepoIcon repoGroupKey={row.workspace.repoGroupKey} repoName={row.workspace.repoName} size="sm" />
      <WorktreeTag row={row} />
      <ListRowText primary={row.title} secondary={row.repoName} />
      <StatusTag status={row.status} />
      <ListRowMeta>{waited ? `waiting ${waited}` : 'just now'}</ListRowMeta>
    </ListRow>
  )
}

function snippetOf({ row, snippet }: LiveCard): string {
  if (snippet) return snippet
  return row.kind === 'observed' ? `in VS Code · ${OBSERVED_STATUS_LABEL[row.status].toLowerCase()}` : 'No reply yet'
}

function LiveSessionCard({ card, now }: { card: LiveCard; now: number }) {
  const { row } = card
  return (
    <Card surface="widget" onClick={() => openRow(row)} tooltip={`Open ${row.title} in Work`}>
      <CardMeta>
        <RepoIcon repoGroupKey={row.workspace.repoGroupKey} repoName={row.workspace.repoName} size="sm" />
        <WorktreeTag row={row} />
        <CardMetaText trailing={timeAgo(card.lastEventAt, now)}>{row.repoName}</CardMetaText>
      </CardMeta>
      <CardTitle>{row.title}</CardTitle>
      <StatusTag status={row.status} />
      <CardNote>{snippetOf(card)}</CardNote>
    </Card>
  )
}

function UsageRow({ bar }: { bar: UsageBar }) {
  const win = bar.window
  const fill = win?.percent ?? (win?.tone === 'limit' ? 100 : null)
  const value = win?.percent != null ? `${win.percent}% of ${win.label}` : win?.tone === 'limit' ? 'limit reached' : 'no reading yet'
  const resets = win?.resetsAt ? `resets in ${formatResetTime(win.resetsAt)}` : null
  const detail = [resets, `${formatTokens(bar.todayTokens)} tokens today`].filter(Boolean).join(' · ')
  return (
    <StatRow
      label={bar.name}
      value={value}
      gauge={<Meter percent={fill} tone={win?.tone ?? 'ok'} label={`${bar.name} rate-limit window`} size="fill" />}
      detail={detail}
    />
  )
}
