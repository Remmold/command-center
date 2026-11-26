import type { Workspace } from '../../shared/types'

export type FeatureAccount = { ok: true; env: Record<string, string> } | { ok: false; error: string }

export interface FeatureAccountDeps {
  workspace: (workspaceId: string) => Promise<Pick<Workspace, 'profileId'> | undefined>
  hasProfile: (profileId: string) => Promise<boolean>
  prepare: (profileId: string) => Promise<{ env: Record<string, string> }>
}

/** The environment a feature's process runs on; refused, with the reason, when its workspace or account was removed rather than falling back to the default login. */
export async function featureAccount(deps: FeatureAccountDeps, workspaceId: string): Promise<FeatureAccount> {
  const workspace = await deps.workspace(workspaceId)
  if (!workspace) return { ok: false, error: 'The workspace of this feature was removed, so it would run on the default account.' }
  if (!(await deps.hasProfile(workspace.profileId))) return { ok: false, error: 'Its account was removed, so it would run on the default login. Pick an account for the workspace in Settings first.' }
  return { ok: true, env: (await deps.prepare(workspace.profileId)).env }
}
