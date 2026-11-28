import type { ContextReport } from '../../shared/context'
import { buildDriftCheck, driftCheckTitle, driftRunSkeleton, type DriftCheckKind, type DriftCheckProject } from '../../shared/driftCheck'
import { appPrompt } from '../../shared/appPrompts'
import type { Workspace } from '../../shared/types'
import { useContextStore } from './contextStore'
import type { Picked } from './lastPick'
import { startSession } from './sessionNavigation'
import { holdStarting, settleable } from './startRequests'

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
 * Context stays on screen. Resolves with what went wrong, or null. A skeleton whose prompt never reaches a running
 * process is removed, so it never shows as running.
 */
export async function startDriftCheck({ workspace, report, accountName, kind, projects, choice }: DriftCheckStart): Promise<string | null> {
  const account = { name: accountName, folder: report.accountFolder, items: report.layers.account }
  const sessionId = crypto.randomUUID()
  const startedAt = new Date()
  // A map read between the skeleton's write and the chat being hosted must not take the run for stopped.
  const release = holdStarting(sessionId)
  const reached = settleable()
  let started = false
  let file: string
  try {
    const written = await window.api.driftChecks.begin(driftRunSkeleton({ kind, account, projects, runId: newRunId(startedAt), sessionId, startedAt }))
    if (!written.ok) return `Could not write the run file: ${written.error}`
    file = written.file
    const { prompt, addDirs } = buildDriftCheck({ kind, sessionPath: workspace.path, account, projects, findingsFile: file })
    try {
      started = startSession(workspace, { addDirs, send: { prompt: appPrompt('drift-check', prompt, driftCheckTitle(kind)), id: sessionId, delivered: reached.settle, ...choice } })
    } finally {
      // A run whose session never started would show as running forever.
      if (!started) await window.api.driftChecks.discard(file)
    }
  } finally {
    release()
  }
  if (!started) return 'Could not start the session.'
  void reached.settled.then(async (ok) => {
    if (ok) return
    await window.api.driftChecks.discard(file)
    useContextStore.getState().showDrift()
  })
  useContextStore.getState().showDrift()
  return null
}
