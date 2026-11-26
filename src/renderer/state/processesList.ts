import type { BackgroundProcess, BackgroundProcessStatus } from '../../shared/backgroundProcesses'
import type { LocalServer } from '../../shared/localPorts'
import { repoDisplayName, type RepoIdentityViews } from '../../shared/repoIdentity'
import type { TerminalInfo, Workspace } from '../../shared/types'

export interface ProcessesListInput {
  workspaces: readonly Workspace[]
  identities: RepoIdentityViews
  /** Every hosted session, for its workspace and title. */
  sessions: readonly { paneId: string; workspaceId: string; title: string }[]
  /** Background processes by pane, as the tracker reports them. */
  claude: Readonly<Record<string, readonly BackgroundProcess[]>>
  /** Servers whose port answered, by pane and task id. */
  claudeServers: Readonly<Record<string, Readonly<Record<string, readonly LocalServer[]>>>>
  terminals: readonly TerminalInfo[]
  /** A terminal run's servers whose port answered, by `terminalRunKey`. */
  terminalServers: Readonly<Record<string, readonly LocalServer[]>>
}

interface RowBase {
  key: string
  /** The command, or a terminal's label. */
  name: string
  /** The session's title, or "You". */
  owner: string
  /** Running, Finished, Failed, Stopped, or Exited (code). */
  status: string
  running: boolean
  /** How it ended: Finished and Exited (0) are ok; Failed, Stopped and other codes failed. */
  tone: 'running' | 'ok' | 'failed'
  startedAt: number
  endedAt?: number
  /** Only while running. */
  servers: readonly LocalServer[]
}

export interface ClaudeProcessRow extends RowBase {
  source: 'claude'
  paneId: string
  taskId: string
}

export interface TerminalRow extends RowBase {
  source: 'terminal'
  terminalId: string
  command?: string
}

export type ProcessRow = ClaudeProcessRow | TerminalRow

export interface ProcessGroup {
  workspaceId: string
  /** Absent for a terminal whose workspace was removed. */
  repoGroupKey?: string
  repoName: string
  /** The repo's display name, with the worktree's tag. */
  name: string
  rows: ProcessRow[]
}

export const YOU = 'You'

const CLAUDE_STATUS: Record<BackgroundProcessStatus, string> = { running: 'Running', finished: 'Finished', failed: 'Failed', stopped: 'Stopped' }
const CLAUDE_TONE: Record<BackgroundProcessStatus, RowBase['tone']> = { running: 'running', finished: 'ok', failed: 'failed', stopped: 'failed' }
const NO_SERVERS: readonly LocalServer[] = []

export const claudeRowKey = (paneId: string, taskId: string): string => `claude:${paneId}:${taskId}`
export const terminalRowKey = (terminalId: string): string => `terminal:${terminalId}`
/** A restart is a new run, whose servers are asked again. */
export const terminalRunKey = (t: Pick<TerminalInfo, 'id' | 'startedAt'>): string => `${t.id}:${t.startedAt}`

function terminalStatus(t: TerminalInfo): string {
  if (t.status === 'running') return 'Running'
  return t.exitCode === undefined ? 'Stopped' : `Exited (${t.exitCode})`
}

function terminalTone(t: TerminalInfo): RowBase['tone'] {
  if (t.status === 'running') return 'running'
  return t.exitCode === 0 ? 'ok' : 'failed'
}

/** The servers this run's output named that answered. */
function answering(t: TerminalInfo, confirmed: readonly LocalServer[] | undefined): readonly LocalServer[] {
  if (t.status !== 'running' || !t.servers || !confirmed) return NO_SERVERS
  return t.servers.filter((s) => confirmed.some((c) => c.port === s.port))
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

const byRunningThenNewest = (a: ProcessRow, b: ProcessRow): number => Number(b.running) - Number(a.running) || b.startedAt - a.startedAt

/** Every Claude background process and terminal, grouped by workspace in the workspaces' order. */
export function processesList(input: ProcessesListInput): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>()
  const groupOf = (workspaceId: string, cwd: string): ProcessGroup => {
    const known = groups.get(workspaceId)
    if (known) return known
    const w = input.workspaces.find((x) => x.id === workspaceId)
    const repoName = w ? repoDisplayName(w.repoName, input.identities[w.repoGroupKey]) : folderName(cwd)
    const group: ProcessGroup = w
      ? { workspaceId, repoGroupKey: w.repoGroupKey, repoName: w.repoName, name: w.worktreeTag ? `${repoName} · ${w.worktreeTag}` : repoName, rows: [] }
      : { workspaceId, repoName, name: repoName, rows: [] }
    groups.set(workspaceId, group)
    return group
  }

  for (const session of input.sessions) {
    const workspace = input.workspaces.find((w) => w.id === session.workspaceId)
    if (!workspace) continue
    for (const p of input.claude[session.paneId] ?? []) {
      const running = p.status === 'running'
      groupOf(workspace.id, workspace.path).rows.push({
        source: 'claude',
        key: claudeRowKey(session.paneId, p.taskId),
        paneId: session.paneId,
        taskId: p.taskId,
        name: p.command,
        owner: session.title,
        status: CLAUDE_STATUS[p.status],
        running,
        tone: CLAUDE_TONE[p.status],
        startedAt: p.startedAt,
        ...(p.endedAt !== undefined ? { endedAt: p.endedAt } : {}),
        servers: running ? (input.claudeServers[session.paneId]?.[p.taskId] ?? NO_SERVERS) : NO_SERVERS
      })
    }
  }
  for (const t of input.terminals) {
    const running = t.status === 'running'
    groupOf(t.workspaceId, t.cwd).rows.push({
      source: 'terminal',
      key: terminalRowKey(t.id),
      terminalId: t.id,
      name: t.label,
      ...(t.command !== undefined ? { command: t.command } : {}),
      owner: YOU,
      status: terminalStatus(t),
      running,
      tone: terminalTone(t),
      startedAt: t.startedAt,
      ...(t.endedAt !== undefined ? { endedAt: t.endedAt } : {}),
      servers: answering(t, input.terminalServers[terminalRunKey(t)])
    })
  }

  const order = new Map(input.workspaces.map((w, i) => [w.id, i]))
  const rank = (g: ProcessGroup): number => order.get(g.workspaceId) ?? order.size
  return [...groups.values()].sort((a, b) => rank(a) - rank(b)).map((g) => ({ ...g, rows: g.rows.sort(byRunningThenNewest) }))
}

/** The chosen row while it is listed, else the first running one. */
export function selectedRowKey(groups: readonly ProcessGroup[], chosen: string | null): string | null {
  const rows = groups.flatMap((g) => g.rows)
  if (chosen !== null && rows.some((r) => r.key === chosen)) return chosen
  return rows.find((r) => r.running)?.key ?? null
}
