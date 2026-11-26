import { repoDisplayName, type RepoIdentityViews } from './repoIdentity'
import type { Workspace } from './types'

/** The repo's display name, with the worktree's tag. */
export const workspaceLabel = (workspace: Workspace, repoName: string): string => (workspace.worktreeTag ? `${repoName} · ${workspace.worktreeTag}` : repoName)

/** Each workspace with the label the New feature dialog's Workspace picker shows; the digest and the proposal card use the same list. */
export function workspaceOptions(workspaces: readonly Workspace[], identities: RepoIdentityViews): { id: string; label: string }[] {
  return workspaces.map((w) => ({ id: w.id, label: workspaceLabel(w, repoDisplayName(w.repoName, identities[w.repoGroupKey])) }))
}
