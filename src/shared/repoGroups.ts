import type { Workspace } from './types'

export interface RepoGroupView {
  repoGroupKey: string
  repoName: string
  /** Main checkout first, then worktrees by tag. */
  workspaces: Workspace[]
}

export function groupByRepo(workspaces: Workspace[]): RepoGroupView[] {
  const groups = new Map<string, RepoGroupView>()
  for (const w of workspaces) {
    const group = groups.get(w.repoGroupKey)
    if (group) group.workspaces.push(w)
    else groups.set(w.repoGroupKey, { repoGroupKey: w.repoGroupKey, repoName: w.repoName, workspaces: [w] })
  }
  const all = [...groups.values()]
  for (const g of all) {
    g.workspaces.sort((a, b) => a.worktreeTag.localeCompare(b.worktreeTag, undefined, { numeric: true }))
  }
  return all.sort((a, b) => a.repoName.localeCompare(b.repoName, undefined, { sensitivity: 'base' }))
}

/** Stable hue per repo group key, for the default letter icon. */
export function repoGroupHue(repoGroupKey: string): number {
  let hash = 2166136261
  for (let i = 0; i < repoGroupKey.length; i++) {
    hash ^= repoGroupKey.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 360
}
