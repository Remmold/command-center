import { homedir } from 'node:os'
import type { ContextReport } from '../../shared/context'
import type { AccountProfile, Workspace } from '../../shared/types'
import * as profiles from '../profiles/store'
import * as workspaces from '../workspaces/store'
import { readContext } from './reader'

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
  return workspace ? reportFor(workspace, await profiles.list()) : null
}

/** Every workspace's start total by id; null for a workspace whose folder is gone. */
export async function startTotals(): Promise<Record<string, number | null>> {
  const [list, all] = await Promise.all([workspaces.list(), profiles.list()])
  const reports = await Promise.all(list.map((w) => reportFor(w, all)))
  return Object.fromEntries(list.map((w, i) => [w.id, reports[i].folderExists ? reports[i].startTotal : null]))
}
