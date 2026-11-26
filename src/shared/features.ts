/** One feature made through New feature; the single link between its session, worktree and workspace. Its account is its workspace's profile, never stored here. */
export interface FeatureRecord {
  name: string
  /** The feature worktree's workspace; it carries the feature's account profile. */
  workspaceId: string
  worktreePath: string
  branch: string
  sessionId: string
  /** Reserved server ports; empty until a feature boots servers. */
  ports: number[]
  startedAt: number
  completedAt: number | null
}

export interface NewFeatureRequest {
  /** The workspace the feature is made in; its account and repo are the feature's. */
  workspaceId: string
  name: string
  description: string
  /** The id the renderer starts the feature session under. */
  sessionId: string
}

export type NewFeatureResult =
  | { ok: true; feature: FeatureRecord }
  | { ok: false; error: string }

/** The first prompt of a feature session: `/flow`, the description, and where it works. */
export function featureFirstPrompt(feature: Pick<FeatureRecord, 'name' | 'worktreePath'>, description: string): string {
  return [
    `/flow ${description.trim()}`,
    '',
    `Feature name: ${feature.name}`,
    `Feature worktree: ${feature.worktreePath}`,
    'Work in this worktree; do not make another one.'
  ].join('\n')
}
