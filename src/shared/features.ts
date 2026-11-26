/** One feature made through New feature; the single link between its session, worktree and workspace. Its account is its workspace's profile, never stored here. */
export interface FeatureRecord {
  name: string
  /** The feature worktree's workspace; it carries the feature's account profile. */
  workspaceId: string
  /** The workspace picked in New feature, whose preview config the feature uses; absent on records made before ticket 04. */
  sourceWorkspaceId?: string
  worktreePath: string
  branch: string
  sessionId: string
  /** The Claude CLI's own id for the session, once known; what resumes it after the chat is gone. */
  claudeSessionId?: string
  /** Reserved server ports; empty until a feature boots servers. */
  ports: number[]
  /** The server each port was reserved for, by position in `ports`; kept per name so editing the preview config never swaps ports. */
  portNames?: string[]
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

export type FeatureOpen =
  | { kind: 'open' }
  | { kind: 'rehost'; claudeSessionId: string }
  | { kind: 'missing'; reason: string }

/** What clicking a feature row does: show its hosted chat, host it again resumed, or say plainly why it cannot. */
export function featureOpenPlan(
  feature: Pick<FeatureRecord, 'name' | 'claudeSessionId' | 'sessionId'>,
  hosted: boolean,
  workspaceExists: boolean,
  worktreeMissing: boolean
): FeatureOpen {
  if (hosted) return { kind: 'open' }
  if (!workspaceExists) return { kind: 'missing', reason: `The session of ${feature.name} was not found: its workspace was removed.` }
  if (worktreeMissing) return { kind: 'missing', reason: `The session of ${feature.name} was not found: its worktree folder is gone.` }
  if (!feature.claudeSessionId) return { kind: 'missing', reason: `The session of ${feature.name} was not found: it was closed before Claude gave it an id, so there is nothing to resume.` }
  return { kind: 'rehost', claudeSessionId: feature.claudeSessionId }
}

/** Each server's port by its name; a record from before names were kept is read against `legacyNames`, in order. */
export function namedPorts(record: Pick<FeatureRecord, 'ports' | 'portNames'>, legacyNames: readonly string[] = []): Map<string, number> {
  const names = record.portNames ?? legacyNames
  const map = new Map<string, number>()
  record.ports.forEach((port, i) => {
    const name = names[i]
    if (name !== undefined && !map.has(name)) map.set(name, port)
  })
  return map
}
