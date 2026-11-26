import { useEffect, useMemo } from 'react'
import { useTicking } from '../../hooks/useTicking'
import { useBackgroundProcessesStore } from '../../state/backgroundProcessesStore'
import { processesList, selectedRowKey, type ProcessGroup, type ProcessRow } from '../../state/processesList'
import { useProcessesViewStore } from '../../state/processesViewStore'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { useTerminalsStore } from '../../state/terminalsStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { duration } from '../chat/subagents'
import { ProcessOutputTerminal } from '../ProcessOutputTerminal'
import { RepoIcon } from '../RepoIcon'
import { ServerLink } from '../ServerLink'
import { Terminal } from '../Terminal'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { NoticeLine } from '../ui/NoticeLine'
import { ListItem, ListRow, ListRowLabel, ListRowLines, ListRowMeta } from '../ui/ListRow'
import { Pane } from '../ui/Pane'
import { SidebarLayout } from '../ui/SidebarLayout'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { Toolbar } from '../ui/Toolbar'

const REFRESH_MS = 1000
const DOT: Record<ProcessRow['tone'], Exclude<TimelineDot, 'none' | 'neutral'>> = { running: 'progress', ok: 'success', failed: 'error' }

function useProcessGroups(): ProcessGroup[] {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const identities = useRepoIdentitiesStore((s) => s.identities)
  const views = useProjectViewsStore((s) => s.views)
  const claude = useBackgroundProcessesStore((s) => s.byPane)
  const claudeServers = useBackgroundProcessesStore((s) => s.servers)
  const byId = useTerminalsStore((s) => s.byId)
  const terminalServers = useProcessesViewStore((s) => s.terminalServers)
  return useMemo(() => {
    const sessions = Object.values(views).flatMap((v) => v.claudeSessions.map((c) => ({ paneId: c.id, workspaceId: v.projectId, title: c.title })))
    return processesList({ workspaces, identities, sessions, claude, claudeServers, terminals: Object.values(byId), terminalServers })
  }, [workspaces, identities, views, claude, claudeServers, byId, terminalServers])
}

/** While the view shows: running Claude processes' output and servers each second, an ended one's output once, and whether terminals' servers answer. */
function useRefresh(groups: readonly ProcessGroup[]): void {
  const rows = groups.flatMap((g) => g.rows)
  const claudeRows = rows.filter((r) => r.source === 'claude')
  const running = claudeRows
    .filter((r) => r.running)
    .map((r) => `${r.paneId}\n${r.taskId}`)
    .join('\n\n')
  const ended = claudeRows
    .filter((r) => !r.running)
    .map((r) => `${r.paneId}\n${r.taskId}`)
    .join('\n\n')
  useEffect(() => {
    const { fetchOutput } = useBackgroundProcessesStore.getState()
    const refresh = (): void => {
      for (const key of running ? running.split('\n\n') : []) {
        const [paneId, taskId] = key.split('\n')
        void fetchOutput(paneId, taskId)
      }
      void useProcessesViewStore.getState().checkTerminalServers(Object.values(useTerminalsStore.getState().byId))
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [running])
  useEffect(() => {
    const { fetchOutput } = useBackgroundProcessesStore.getState()
    for (const key of ended ? ended.split('\n\n') : []) {
      const [paneId, taskId] = key.split('\n')
      void fetchOutput(paneId, taskId)
    }
  }, [ended])
}

/** Every Claude background process and terminal across workspaces, the selected one in a terminal on the right. */
export function ProcessesView() {
  const groups = useProcessGroups()
  const chosen = useProcessesViewStore((s) => s.chosen)
  const select = useProcessesViewStore((s) => s.select)
  const selectedKey = selectedRowKey(groups, chosen)
  const selected = groups.flatMap((g) => g.rows).find((r) => r.key === selectedKey) ?? null
  // The row picked for him stays picked once it ends.
  useEffect(() => {
    if (chosen === null && selectedKey !== null) select(selectedKey)
  }, [chosen, selectedKey, select])
  const now = useTicking(groups.some((g) => g.rows.some((r) => r.running)))
  useRefresh(groups)

  return (
    <SidebarLayout
      width="wide"
      sidebar={
        groups.length === 0 ? (
          <EmptyState>Nothing is running.</EmptyState>
        ) : (
          groups.map((g) => <Group key={g.workspaceId} group={g} selectedKey={selectedKey} now={now} onSelect={select} />)
        )
      }
    >
      {selected ? <SelectedProcess key={selected.key} row={selected} /> : <EmptyState>Pick a process or terminal on the left.</EmptyState>}
    </SidebarLayout>
  )
}

interface GroupProps {
  group: ProcessGroup
  selectedKey: string | null
  now: number
  onSelect: (key: string) => void
}

function Group({ group, selectedKey, now, onSelect }: GroupProps) {
  return (
    <ul aria-label={group.name} className="py-1">
      <ListItem alignWithRows>
        {group.repoGroupKey && <RepoIcon repoGroupKey={group.repoGroupKey} repoName={group.repoName} size="sm" />}
        <ListRowLabel>{group.name}</ListRowLabel>
      </ListItem>
      {group.rows.map((row) => (
        <ListRow
          key={row.key}
          rowKey={row.key}
          nested
          active={row.key === selectedKey}
          tooltip={row.name}
          onClick={() => onSelect(row.key)}
          actions={row.servers.length > 0 ? row.servers.map((s) => <ServerLink key={s.port} server={s} />) : undefined}
          actionsPinned
        >
          <DotMark dot={DOT[row.tone]} />
          <ListRowLines
            primary={<span className="min-w-0 flex-1 truncate font-mono">{row.name}</span>}
            secondary={
              <>
                <span className="min-w-0 truncate">
                  {row.status} · {row.owner}
                </span>
                <ListRowMeta>{duration(now - row.startedAt)}</ListRowMeta>
              </>
            }
          />
        </ListRow>
      ))}
    </ul>
  )
}

function SelectedProcess({ row }: { row: ProcessRow }) {
  const stopError = useBackgroundProcessesStore((s) => (row.source === 'claude' ? s.stopErrors[row.paneId]?.[row.taskId] : undefined))
  return (
    <Pane label={row.name}>
      <Toolbar actions={<RowActions row={row} />}>
        <HeaderRow title={row.name} note={`${row.status} · ${row.owner}`} />
      </Toolbar>
      {stopError && (
        <NoticeLine tone="warning" strip>
          Could not stop it: {stopError}
        </NoticeLine>
      )}
      <div className="min-h-0 flex-1 p-2">
        {row.source === 'terminal' ? <Terminal terminalId={row.terminalId} /> : <ProcessOutputTerminal paneId={row.paneId} taskId={row.taskId} />}
      </div>
    </Pane>
  )
}

function RowActions({ row }: { row: ProcessRow }) {
  const stop = (): void => {
    if (row.source === 'claude') void useBackgroundProcessesStore.getState().stop(row.paneId, row.taskId)
    else void window.api.terminals.stop(row.terminalId)
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {row.servers.map((s) => (
        <ServerLink key={s.port} server={s} />
      ))}
      {row.running && (
        <Button variant="danger" onClick={stop}>
          Stop
        </Button>
      )}
    </span>
  )
}
