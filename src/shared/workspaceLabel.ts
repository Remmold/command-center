import type { Workspace } from './types'

/** The repo's display name, with the worktree's tag. */
export const workspaceLabel = (workspace: Workspace, repoName: string): string => (workspace.worktreeTag ? `${repoName} · ${workspace.worktreeTag}` : repoName)

