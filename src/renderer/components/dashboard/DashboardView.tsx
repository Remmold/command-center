import { useEffect } from 'react'
import { Inbox } from 'lucide-react'
import { APPROVALS_SHORTCUT } from '../../hooks/useKeyboardShortcuts'
import { useApprovalInboxStore } from '../../state/approvalInboxStore'
import { IconButton } from '../ui/IconButton'
import { OBSERVED_STATUS_LABEL } from '../../../shared/types'
import { STATUS_LABEL } from '../../../shared/needsYou'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { useBoardStore } from '../../state/boardStore'
import type { LiveCard } from '../../state/dashboard'
import { elapsed, timeAgo, type NowBuildingRow } from '../../state/nowBuilding'
import { openInDrawer } from '../../state/sessionNavigation'
import { useChatDrawerStore } from '../../state/chatDrawer'
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
import { DrawerHost } from '../ui/Drawer'
import { ChatDrawer } from './ChatDrawer'
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
  const drawerPane = dash.drawer?.paneId ?? null

  useEffect(() => {
    initBoard()
  }, [initBoard])

  return (
    <DrawerHost>
      <div className="min-h-0 min-w-0 flex-1">
        <Page label="Dashboard">
          <PageBody>
            <VsCodeAccountsNotice />
            <Panel title="Needs you" count={dash.needsYou.length} empty="Nobody is waiting on you" boxed>
              <ul>
                {dash.needsYou.map((row) => (
                  <NeedsYouRow key={row.key} row={row} now={now} account={dash.accountTags[row.key]} selected={row.paneId === drawerPane} />
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
                  <LiveSessionCard
                    key={card.row.key}
                    card={card}
                    now={now}
                    account={dash.accountTags[card.row.key]}
                    selected={card.row.kind === 'hosted' && card.row.paneId === drawerPane}
                  />
                ))}
              </CardGrid>
            </Panel>
          </PageBody>
        </Page>
      </div>
      {dash.drawer && <ChatDrawer row={dash.drawer} account={dash.accountTags[dash.drawer.key]} />}
    </DrawerHost>
  )
}

function WorktreeTag({ row }: { row: SessionRow }) {
  return row.workspace.worktreeTag ? <Badge>{row.workspace.worktreeTag}</Badge> : null
}

function NeedsYouRow({ row, now, account, selected }: { row: HostedRow; now: number; account?: string; selected: boolean }) {
  const waited = elapsed(row.statusSince, now)
  const approvals =
    row.status === 'needs-approval' ? (
      <IconButton label="Open in approvals" tooltip={`Open in approvals (${APPROVALS_SHORTCUT})`} onClick={() => useApprovalInboxStore.getState().show(row.paneId)}>
        <Inbox size={14} strokeWidth={2} />
      </IconButton>
    ) : undefined
  return (
    <ListRow onClick={() => openInDrawer(row.paneId)} active={selected} tooltip={`${row.title} · ${row.repoName} · ${STATUS_LABEL[row.status]}`} actions={approvals}>
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

function LiveSessionCard({ card, now, account, selected }: { card: LiveCard; now: number; account?: string; selected: boolean }) {
  const { row } = card
  return (
    <Card
      surface="widget"
      onClick={() => (row.kind === 'hosted' ? openInDrawer(row.paneId) : openRow(row))}
      selected={selected}
      tooltip={row.kind === 'hosted' ? `Open ${row.title} here` : `Open ${row.title} in Work`}
    >
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
      tooltip={[entry.email, ...entry.bars.map((b) => b.tooltip)].filter(Boolean).join('\n') || undefined}
    />
  )
}
