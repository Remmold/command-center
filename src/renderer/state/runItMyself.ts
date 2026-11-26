import { DEFAULT_SHELL_KIND } from '../../shared/types'
import { processOf, useBackgroundProcessesStore } from './backgroundProcessesStore'
import { terminalRowKey } from './processesList'
import { useProcessesViewStore } from './processesViewStore'
import { useProjectViewsStore, viewOfSession } from './projectViewsStore'
import { useTerminalsStore } from './terminalsStore'

/** Reruns a Claude background process's command as Andreas's own terminal in its session's workspace folder, and selects it. */
export async function runItMyself(paneId: string, taskId: string): Promise<void> {
  const process = processOf(useBackgroundProcessesStore.getState(), paneId, taskId)
  const view = viewOfSession(useProjectViewsStore.getState().views, paneId)
  if (!process || !view) return
  const running = (): boolean => processOf(useBackgroundProcessesStore.getState(), paneId, taskId)?.status === 'running'
  // Two copies of a server would fight over its port, so a failed stop starts nothing, unless it failed because the process ended meanwhile.
  if (running() && !(await useBackgroundProcessesStore.getState().stop(paneId, taskId)) && running()) return
  const id = crypto.randomUUID()
  useProcessesViewStore.getState().select(terminalRowKey(id))
  await useTerminalsStore.getState().create({ id, workspaceId: view.projectId, cwd: view.projectPath, kind: DEFAULT_SHELL_KIND, command: process.command, label: process.command })
}
