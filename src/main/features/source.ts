import type { FeatureRecord } from '../../shared/features'
import type { Workspace } from '../../shared/types'

/**
 * The workspaces whose preview config a feature uses, best first: the one picked in New feature, else (a record made
 * before it was stored) the main checkout of the worktree's repo group, else any other workspace of the group.
 */
export function sourceCandidates(feature: Pick<FeatureRecord, 'workspaceId' | 'sourceWorkspaceId'>, workspaces: readonly Workspace[]): string[] {
  const own = workspaces.find((w) => w.id === feature.workspaceId)
  const group = own ? workspaces.filter((w) => w.id !== own.id && w.repoGroupKey === own.repoGroupKey) : []
  const ordered = [...group.filter((w) => w.worktreeTag === ''), ...group.filter((w) => w.worktreeTag !== '')].map((w) => w.id)
  return [...new Set([...(feature.sourceWorkspaceId ? [feature.sourceWorkspaceId] : []), ...ordered])]
}
