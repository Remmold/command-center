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
import type { UsageEntry } from '../../state/usageModel'
import { UsageMeters } from '../AccountUsage'
import { useViewStore } from '../../state/viewStore'
import { openRow } from '../../state/workSessions'
import { AccountTag } from '../AccountTag'
import { RepoIcon } from '../RepoIcon'
import { Badge } from '../ui/Badge'
import { Card, CardGrid, CardMeta, CardMetaText, CardNote, CardTitle } from '../ui/Card'
import { ListRow, ListRowMeta, ListRowText } from '../ui/ListRow'
import { Page, PageBody } from '../ui/Page'
import { Panel, PanelColumns } from '../ui/Panel'
import { StatRow } from '../ui/StatRow'
import { StatusTag } from '../ui/StatusDot'
import { NowBuildingList } from './NowBuildingList'
import { VsCodeAccountsNotice } from './VsCodeAccountsNotice'

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
        <VsCodeAccountsNotice />
        <Panel title="Needs you" count={dash.needsYou.length} empty="Nobody is waiting on you" boxed>
          <ul>
            {dash.needsYou.map((row) => (
              <NeedsYouRow key={row.key} row={row} now={now} account={dash.accountTags[row.key]} />
            ))}
          </ul>
        </Panel>
        <PanelColumns
          main={
            <Panel title="Now building" count={dash.nowBuilding.count} empty="Nothing in progress" boxed>
              <NowBuildingList building={dash.nowBuilding} now={now} onOpen={openOnBoard} accountTags={dash.accountTags} />
            </Panel>
          }
          side={
            <Panel title="Usage per account" count={dash.usage.length} empty="No usage yet" boxed>
              <ul>
                {dash.usage.map((entry) => (
                  <UsageRow key={entry.profileId} entry={entry} />
                ))}
              </ul>
            </Panel>
          }
        />
        <Panel title="Live sessions" count={dash.live.length} empty="No live sessions">
          <CardGrid label="Live sessions">
            {dash.live.map((card) => (
              <LiveSessionCard key={card.row.key} card={card} now={now} account={dash.accountTags[card.row.key]} />
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

function NeedsYouRow({ row, now, account }: { row: HostedRow; now: number; account?: string }) {
  const waited = elapsed(row.statusSince, now)
  return (
    <ListRow onClick={() => openSession(row.paneId)} tooltip={`${row.title} · ${row.repoName} · ${STATUS_LABEL[row.status]}`}>
      <RepoIcon repoGroupKey={row.workspace.repoGroupKey} repoName={row.workspace.repoName} size="sm" />
      <WorktreeTag row={row} />
      <ListRowText primary={row.title} secondary={row.repoName} />
      <AccountTag label={account} />
      <StatusTag status={row.status} />
      <ListRowMeta>{waited ? `waiting ${waited}` : 'just now'}</ListRowMeta>
    </ListRow>
  )
}

function snippetOf({ row, snippet }: LiveCard): string {
  if (snippet) return snippet
  return row.kind === 'observed' ? `in VS Code · ${OBSERVED_STATUS_LABEL[row.status].toLowerCase()}` : 'No reply yet'
}

function LiveSessionCard({ card, now, account }: { card: LiveCard; now: number; account?: string }) {
  const { row } = card
  return (
    <Card surface="widget" onClick={() => openRow(row)} tooltip={`Open ${row.title} in Work`}>
      <CardMeta>
        <RepoIcon repoGroupKey={row.workspace.repoGroupKey} repoName={row.workspace.repoName} size="sm" />
        <WorktreeTag row={row} />
        <CardMetaText trailing={timeAgo(card.lastEventAt, now)}>{row.repoName}</CardMetaText>
        <AccountTag label={account} />
        <StatusTag status={row.status} />
      </CardMeta>
      <CardTitle>{row.title}</CardTitle>
      <CardNote>{snippetOf(card)}</CardNote>
    </Card>
  )
}

const STATE_TEXT: Record<Exclude<UsageEntry['state'], 'ready'>, string> = {
  loading: 'Loading usage data…',
  error: 'Failed to load usage data',
  'not-logged-in': 'not logged in'
}

function UsageRow({ entry }: { entry: UsageEntry }) {
  const detail =
    entry.state === 'ready'
      ? entry.bars.map((b) => `${b.label} ${b.percent}%${b.resetText ? ` · resets ${b.resetText}` : ''}`).join(' · ') ||
        "Plan limits aren't available for this login method."
      : STATE_TEXT[entry.state]
  return (
    <StatRow
      label={entry.label}
      value={entry.plan ?? ''}
      gauge={<UsageMeters entry={entry} size="fill" />}
      detail={detail}
      tooltip={entry.bars.map((b) => b.tooltip).join('\n') || undefined}
    />
  )
}
