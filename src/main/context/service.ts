import { homedir } from 'node:os'
import type { ContextFileResult, ContextFileText, ContextReport } from '../../shared/context'
import type { AccountProfile, Workspace } from '../../shared/types'
import * as profiles from '../profiles/store'
import * as workspaces from '../workspaces/store'
import { readContextFile, writeContextFile } from './guard'
import { readContext } from './reader'

/** The report each workspace last showed; the guarded read and write accept only what it listed. */
const latest = new Map<string, ContextReport>()

/** An unknown profile id runs on Default, as `profiles.get` resolves it. */
function reportFor(workspace: Workspace, all: AccountProfile[]): Promise<ContextReport> {
  const profile = all.find((p) => p.id === workspace.profileId) ?? all[0]
  return readContext({
    workspacePath: workspace.path,
    configDir: profile.configDir,
    defaultConfigDir: profiles.defaultConfigDir(),
    adoptedDirs: all.filter((p) => p.adopted).map((p) => p.configDir),
    homeDir: homedir()
  })
}

/** The context report of an added workspace; null for an unknown id. */
export async function contextReport(workspaceId: string): Promise<ContextReport | null> {
  const workspace = (await workspaces.list()).find((w) => w.id === workspaceId)
  if (!workspace) return null
  const report = await reportFor(workspace, await profiles.list())
  latest.set(workspaceId, report)
  return report
}

export function readListedFile(workspaceId: string, path: string): Promise<ContextFileText> {
  return readContextFile(latest.get(workspaceId) ?? null, path)
}

export function writeListedFile(workspaceId: string, path: string, content: string): Promise<ContextFileResult> {
  return writeContextFile(latest.get(workspaceId) ?? null, path, content)
}

/** Every workspace's start total by id; null for a workspace whose folder is gone. */
export async function startTotals(): Promise<Record<string, number | null>> {
  const [list, all] = await Promise.all([workspaces.list(), profiles.list()])
  const reports = await Promise.all(list.map((w) => reportFor(w, all)))
  return Object.fromEntries(list.map((w, i) => [w.id, reports[i].folderExists ? reports[i].startTotal : null]))
}
