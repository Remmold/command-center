import { join } from 'node:path'
import type { Workspace } from '../../shared/types'
import * as profiles from './store'
import * as workspaces from '../workspaces/store'

/** Claude names a project's transcript folder after its cwd with every non-alphanumeric turned into '-'. */
export function sanitizeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function transcriptsDir(configDir: string, cwd: string): string {
  return join(configDir, 'projects', sanitizeCwd(cwd))
}

/** `<profile folder>/projects/<sanitised cwd>/` for the workspace's profile. */
export async function transcriptsDirForWorkspace(
  workspace: Pick<Workspace, 'path' | 'profileId'>
): Promise<string> {
  const profile = await profiles.get(workspace.profileId)
  return transcriptsDir(profile.configDir, workspace.path)
}

/** For a cwd that is not an added workspace, Default's folder. */
export async function transcriptsDirForCwd(cwd: string): Promise<string> {
  const workspace = await workspaces.findByPath(cwd)
  return workspace
    ? transcriptsDirForWorkspace(workspace)
    : transcriptsDir(profiles.defaultConfigDir(), cwd)
}
