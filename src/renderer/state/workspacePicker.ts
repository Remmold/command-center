import { repoDisplayName, type RepoIdentityViews } from '../../shared/repoIdentity'
import type { Workspace } from '../../shared/types'

export interface WorkspacePickInput {
  workspaces: readonly Workspace[]
  identities: RepoIdentityViews
  query: string
  /** Last use per workspace id; used ones come first, newest first. */
  recent?: Readonly<Record<string, number>>
}

export interface WorkspacePick {
  workspace: Workspace
  /** The repo group's display name. */
  repoName: string
}

const byRepoThenTag = (a: WorkspacePick, b: WorkspacePick): number =>
  a.repoName.localeCompare(b.repoName) || a.workspace.worktreeTag.localeCompare(b.workspace.worktreeTag)

/** Lower-cased, with Windows path separators typed either way. */
const normalise = (text: string): string => text.toLowerCase().replace(/\\/g, '/')

function matches({ workspace, repoName }: WorkspacePick, words: readonly string[]): boolean {
  const haystack = normalise([repoName, workspace.worktreeTag, workspace.name, workspace.path].join('\n'))
  return words.every((w) => haystack.includes(w))
}

export function workspacePicks({ workspaces, identities, query, recent = {} }: WorkspacePickInput): WorkspacePick[] {
  const words = normalise(query).split(/\s+/).filter(Boolean)
  const lastUse = (pick: WorkspacePick) => recent[pick.workspace.id] ?? 0
  return workspaces
    .map((workspace) => ({ workspace, repoName: repoDisplayName(workspace.repoName, identities[workspace.repoGroupKey]) }))
    .filter((pick) => matches(pick, words))
    .sort((a, b) => lastUse(b) - lastUse(a) || byRepoThenTag(a, b))
}
