import type { ContextReport } from '../../shared/context'
import { buildDriftCheck, driftRunSkeleton, type DriftCheckKind, type DriftCheckProject } from '../../shared/driftCheck'
import type { Workspace } from '../../shared/types'
import { useContextStore } from './contextStore'
import type { Picked } from './lastPick'
import { startSession } from './sessionNavigation'

export interface DriftCheckStart {
  workspace: Workspace
  report: ContextReport
  accountName: string
  kind: DriftCheckKind
  projects: DriftCheckProject[]
  choice: Picked
}

/** A run id that sorts by its start and names a plain file. */
function newRunId(at: Date): string {
  return `${at.toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`
}

/**
 * Writes the run's skeleton, then starts a hosted session in the workspace that is sent the drift-check prompt while
 * Context stays on screen. Resolves with what went wrong, or null.
 */
export async function startDriftCheck({ workspace, report, accountName, kind, projects, choice }: DriftCheckStart): Promise<string | null> {
  const account = { name: accountName, folder: report.accountFolder, items: report.layers.account }
  const sessionId = crypto.randomUUID()
  const startedAt = new Date()
  const written = await window.api.driftChecks.begin(driftRunSkeleton({ kind, account, projects, runId: newRunId(startedAt), sessionId, startedAt }))
  if (!written.ok) return `Could not write the run file: ${written.error}`
  const { prompt, addDirs } = buildDriftCheck({ kind, sessionPath: workspace.path, account, projects, findingsFile: written.file })
  if (!startSession(workspace, { addDirs, send: { prompt, id: sessionId, ...choice } })) return 'Could not start the session.'
  useContextStore.getState().showDrift()
  return null
}
