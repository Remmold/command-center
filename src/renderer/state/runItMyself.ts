import { DEFAULT_SHELL_KIND } from '../../shared/types'
import { useBackgroundProcessesStore } from './backgroundProcessesStore'
import { terminalRowKey } from './processesList'
import { useProcessesViewStore } from './processesViewStore'
import { useProjectViewsStore } from './projectViewsStore'
import { useTerminalsStore } from './terminalsStore'

interface RunItMyselfTarget {
  command: string
  workspaceId: string
  /** The session's workspace folder, where the terminal runs. */
  cwd: string
}

/** The command and folder a Claude background process would rerun in; null once its session or process is gone. */
function runItMyselfTarget(paneId: string, taskId: string): RunItMyselfTarget | null {
  const process = useBackgroundProcessesStore.getState().byPane[paneId]?.find((p) => p.taskId === taskId)
  const view = Object.values(useProjectViewsStore.getState().views).find((v) => v.claudeSessions.some((c) => c.id === paneId))
  if (!process || !view) return null
  return { command: process.command, workspaceId: view.projectId, cwd: view.projectPath }
}

/**
 * Stops Claude's copy (unless it already ended), then starts the same command as Andreas's own terminal in the
 * session's workspace folder and selects it. A failed stop of a process still running starts nothing.
 */
export async function runItMyself(paneId: string, taskId: string): Promise<void> {
  const target = runItMyselfTarget(paneId, taskId)
  if (!target) return
  const running = (): boolean => useBackgroundProcessesStore.getState().byPane[paneId]?.find((p) => p.taskId === taskId)?.status === 'running'
  // A stop that failed because the process ended meanwhile still goes on.
  if (running() && !(await useBackgroundProcessesStore.getState().stop(paneId, taskId)) && running()) return
  const id = crypto.randomUUID()
  useProcessesViewStore.getState().select(terminalRowKey(id))
  await useTerminalsStore.getState().create({ id, workspaceId: target.workspaceId, cwd: target.cwd, kind: DEFAULT_SHELL_KIND, command: target.command, label: target.command })
}
