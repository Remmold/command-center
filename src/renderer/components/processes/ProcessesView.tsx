import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTicking } from '../../hooks/useTicking'
import { useBackgroundProcessesStore } from '../../state/backgroundProcessesStore'
import { processesList, selectedRowKey, terminalRowKey, type ClaudeProcessRow, type ProcessGroup, type ProcessRow, type TerminalRow } from '../../state/processesList'
import { useProcessesViewStore } from '../../state/processesViewStore'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useRepoIdentitiesStore } from '../../state/repoIdentitiesStore'
import { runItMyself } from '../../state/runItMyself'
import { openTerminalInDrawer } from '../../state/sessionNavigation'
import { useTerminalsStore } from '../../state/terminalsStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { duration } from '../chat/subagents'
import { ProcessOutputTerminal } from '../ProcessOutputTerminal'
import { RepoIcon } from '../RepoIcon'
import { ServerLink } from '../ServerLink'
import { Terminal } from '../Terminal'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { NoticeLine } from '../ui/NoticeLine'
import { ListItem, ListRow, ListRowLabel, ListRowLines, ListRowMeta } from '../ui/ListRow'
import { Pane } from '../ui/Pane'
import { SidebarLayout } from '../ui/SidebarLayout'
import { TextField } from '../ui/TextField'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { Toolbar } from '../ui/Toolbar'
import { NewTerminalPicker } from './NewTerminalPicker'

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

/** Each second while the view shows: Claude's processes' output and servers (an ended one's once), and whether terminals' servers answer. */
function useRefresh(): void {
  useEffect(() => {
    const refresh = (): void => {
      const { byPane, fetchOutput } = useBackgroundProcessesStore.getState()
      for (const [paneId, processes] of Object.entries(byPane)) for (const p of processes) void fetchOutput(paneId, p.taskId)
      void useProcessesViewStore.getState().checkTerminalServers(Object.values(useTerminalsStore.getState().byId))
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])
}

/** Every Claude background process and terminal across workspaces, the selected one in a terminal on the right. */
export function ProcessesView() {
  const groups = useProcessGroups()
  const chosen = useProcessesViewStore((s) => s.chosen)
  const select = useProcessesViewStore((s) => s.select)
  const selectedKey = selectedRowKey(groups, chosen)
  const selected = groups.flatMap((g) => g.rows).find((r) => r.key === selectedKey) ?? null
  // Pins the auto-picked row, so it stays picked once it ends.
  useEffect(() => {
    if (chosen === null && selectedKey !== null) select(selectedKey)
  }, [chosen, selectedKey, select])
  // A chosen row that was listed and is gone (closed) hands the pick back to the first running row.
  const listedBefore = useRef(new Set<string>())
  useEffect(() => {
    const listed = new Set(groups.flatMap((g) => g.rows.map((r) => r.key)))
    if (chosen !== null && listedBefore.current.has(chosen) && !listed.has(chosen)) select(null)
    listedBefore.current = listed
  }, [groups, chosen, select])
  const now = useTicking(groups.length > 0)
  const [picking, setPicking] = useState(false)
  useRefresh()

  return (
    <SidebarLayout
      width="wide"
      sidebar={
        <>
          <Toolbar
            actions={
              <Button variant="ghost" onClick={() => setPicking(true)} tooltip="Start a terminal in a workspace, with an optional command">
                <Plus size={13} strokeWidth={2} />
                New terminal
              </Button>
            }
          >
            <HeaderRow title="Processes" />
          </Toolbar>
          {groups.length === 0 ? (
            <EmptyState>Nothing is running.</EmptyState>
          ) : (
            groups.map((g) => <Group key={g.workspaceId} group={g} selectedKey={selectedKey} now={now} onSelect={select} />)
          )}
        </>
      }
    >
      {selected ? <SelectedProcess key={selected.key} row={selected} /> : <EmptyState>Pick a process or terminal on the left.</EmptyState>}
      {picking && <NewTerminalPicker onClose={() => setPicking(false)} onStarted={(id) => select(terminalRowKey(id))} />}
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
  const [renaming, setRenaming] = useState(false)
  const rename = (label: string): void => {
    setRenaming(false)
    if (row.source === 'terminal' && label !== row.name) window.api.terminals.rename(row.terminalId, label)
  }
  return (
    <Pane label={row.name}>
      <Toolbar actions={renaming ? undefined : <RowActions row={row} onRename={() => setRenaming(true)} />}>
        {renaming ? (
          <TextField label="Terminal name" initialValue={row.name} autoFocus submitOnBlur onSubmit={rename} onCancel={() => setRenaming(false)} />
        ) : (
          <HeaderRow title={row.name} note={`${row.status} · ${row.owner}`} />
        )}
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

function RowActions({ row, onRename }: { row: ProcessRow; onRename: () => void }) {
  const stop = (): void => {
    if (row.source === 'claude') void useBackgroundProcessesStore.getState().stop(row.paneId, row.taskId)
    else void window.api.terminals.stop(row.terminalId)
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {row.servers.map((s) => (
        <ServerLink key={s.port} server={s} />
      ))}
      {row.source === 'terminal' ? <TerminalActions row={row} onRename={onRename} /> : <RunItMyself row={row} />}
      {row.running && (
        <Button variant="danger" onClick={stop}>
          Stop
        </Button>
      )}
    </span>
  )
}

/** Stops Claude's copy and reruns its command as Andreas's own terminal, after a confirm. */
function RunItMyself({ row }: { row: ClaudeProcessRow }) {
  const [confirming, setConfirming] = useState(false)
  const cwd = useProjectViewsStore((s) => Object.values(s.views).find((v) => v.claudeSessions.some((c) => c.id === row.paneId))?.projectPath)
  if (cwd === undefined) return null
  const run = (): void => {
    setConfirming(false)
    void runItMyself(row.paneId, row.taskId)
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setConfirming(true)} tooltip="Stop Claude's copy and run the same command as your own terminal">
        Run it myself
      </Button>
      {confirming && (
        <ConfirmDialog
          title="Run it myself"
          message={`Stop Claude's copy and run ${row.name} yourself in ${cwd}? Claude won't see its output any more.`}
          confirmLabel="Run it myself"
          onConfirm={run}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

/** Rename, Open in Shell drawer, Restart once it has exited, and Close, which asks first while it runs. */
function TerminalActions({ row, onRename }: { row: TerminalRow; onRename: () => void }) {
  const workspace = useWorkspacesStore((s) => s.workspaces.find((w) => w.id === row.workspaceId))
  const [confirmingClose, setConfirmingClose] = useState(false)
  const close = (): void => {
    setConfirmingClose(false)
    window.api.terminals.close(row.terminalId)
  }
  return (
    <>
      <Button variant="ghost" onClick={onRename}>
        Rename
      </Button>
      {workspace && (
        <Button variant="ghost" onClick={() => openTerminalInDrawer(workspace, row.terminalId)} tooltip="Show it in Work, in this workspace's Shell drawer">
          Open in Shell drawer
        </Button>
      )}
      {!row.running && (
        <Button variant="secondary" onClick={() => void window.api.terminals.restart(row.terminalId)} tooltip="Run it again in the same place, on a cleared screen">
          Restart
        </Button>
      )}
      <Button variant="secondary" onClick={() => (row.running ? setConfirmingClose(true) : close())}>
        Close
      </Button>
      {confirmingClose && (
        <ConfirmDialog
          title="Close terminal"
          message={`${row.name} is still running. Closing it ends its process.`}
          confirmLabel="Close it"
          onConfirm={close}
          onCancel={() => setConfirmingClose(false)}
        />
      )}
    </>
  )
}
