import type { ContextReport } from '../../shared/context'
import { buildDriftCheck, type DriftCheckProject } from '../../shared/driftCheck'
import { pathKey, type DriftChecksView, type DriftRunView, type ShownFinding } from '../../shared/findings'
import { fixMessage } from '../../shared/fixMessage'
import type { Workspace } from '../../shared/types'
import { isHosted } from './chatDrawer'
import { useProjectViewsStore } from './projectViewsStore'
import { startSession } from './sessionNavigation'
import { sendToChat } from './startRequests'
import { useWorkspacesStore } from './workspacesStore'

export interface ApplyFixes {
  workspace: Workspace
  report: ContextReport
  drift: DriftChecksView | null
  ticked: readonly ShownFinding[]
}

const isUnder = (path: string, folder: string): boolean => pathKey(path).startsWith(`${pathKey(folder)}/`)

/** The covered workspaces' reports, so a new session gets the folders the run's own session had. */
async function runProjects(shown: DriftRunView, workspace: Workspace, report: ContextReport): Promise<DriftCheckProject[]> {
  const workspaces = useWorkspacesStore.getState().workspaces
  const projects = await Promise.all(
    shown.run.workspaces.map(async (path): Promise<DriftCheckProject | null> => {
      if (pathKey(path) === pathKey(report.workspacePath)) return { name: workspace.name, report }
      const other = workspaces.find((w) => pathKey(w.path) === pathKey(path))
      const otherReport = other ? await window.api.context.report(other.id) : null
      return other && otherReport ? { name: other.name, report: otherReport } : null
    })
  )
  return projects.filter((p): p is DriftCheckProject => p !== null)
}

/** A run's added folders, rebuilt as its drift check built them. */
async function runAddDirs(shown: DriftRunView, workspace: Workspace, report: ContextReport): Promise<string[]> {
  const projects = await runProjects(shown, workspace, report)
  const account = { name: '', folder: report.accountFolder, items: report.layers.account }
  return buildDriftCheck({ kind: shown.run.scope, sessionPath: workspace.path, account, projects, findingsFile: shown.file }).addDirs
}

/** With no run, the folders a project drift check adds for health findings: the memory folder, and the account folder when a ticked finding is in it. */
function healthAddDirs(ticked: readonly ShownFinding[], workspace: Workspace, report: ContextReport): string[] {
  const dirs = [report.memoryFolder, ...(ticked.some((f) => isUnder(f.path, report.accountFolder)) ? [report.accountFolder] : [])]
  return dirs.filter((d) => pathKey(d) !== pathKey(workspace.path) && !isUnder(d, workspace.path))
}

/**
 * Sends the ticked findings to the latest shown run's session as one message, as if typed there; with that session
 * gone, or no run at all, a new session on the workspace is started and sent it. Resolves with what went wrong, or null.
 */
export async function applyFixes({ workspace, report, drift, ticked }: ApplyFixes): Promise<string | null> {
  if (ticked.length === 0) return null
  const runs = drift?.runs ?? []
  const prompt = fixMessage(ticked, Object.fromEntries(runs.map((r) => [r.run.runId, r.file])))
  // The account run shows only when it is newer than the covering run, so the last one is the latest.
  const latest = runs.at(-1) ?? null
  if (latest && isHosted(useProjectViewsStore.getState().views, latest.run.sessionId)) {
    sendToChat(latest.run.sessionId, prompt)
    return null
  }
  const addDirs = latest ? await runAddDirs(latest, workspace, report) : healthAddDirs(ticked, workspace, report)
  return startSession(workspace, { addDirs, send: { prompt } }) ? null : 'Could not start a session for the fixes.'
}
