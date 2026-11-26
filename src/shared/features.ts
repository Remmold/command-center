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
  /** The plan agreed in the main chat; main saves it in the new worktree and the session reads it first. */
  brief?: string
}

/** What the proposal card asks main before enabling Go: the request without the session id. */
export type PreflightRequest = Omit<NewFeatureRequest, 'sessionId'>

export type PreflightResult = { ok: true } | { ok: false; error: string }

/** The longest starting brief `createFeature` accepts, in characters. */
export const BRIEF_LIMIT = 20_000

/** Where a feature's starting brief is saved, relative to its worktree. */
export const briefRelativePath = (name: string): string => `.scratch/${name}/brief.md`

export type NewFeatureResult =
  | {
      ok: true
      feature: FeatureRecord
      /** The source workspace's preview config has a server, so the feature has a preview browser. */
      previewBrowser: boolean
      /** The saved starting brief, when the request had one. */
      briefPath?: string
    }
  | { ok: false; error: string }

/** The steps of a start after its checks, in order; a failure names the one it stopped at. */
export type StartStep = 'worktree' | 'brief' | 'install' | 'workspace' | 'record' | 'session'

const STEP_LABEL: Record<StartStep, string> = {
  worktree: 'making the worktree and branch',
  brief: 'saving the starting brief',
  install: 'running the install command',
  workspace: 'adding the worktree as a workspace',
  record: 'recording the feature',
  session: 'starting the feature session'
}

/** What a failed start says: the step, the reason, and exactly what its undo could not remove (nothing, when it removed all). */
export function failureReport(step: StartStep, reason: string, leftBehind: readonly string[]): string {
  const why = reason.trim().replace(/[.\s]+$/, '')
  const left = leftBehind.length === 0 ? 'Nothing was left behind.' : `Left behind, to remove by hand: ${leftBehind.join('; ')}.`
  return `Could not make the feature while ${STEP_LABEL[step]}: ${why}. ${left}`
}

/** The one message the app sends the main chat after a start that ran; it begins `[Command Center]` so the chat knows it is not the user. */
export function startOutcomeMessage(name: string, error: string | null): string {
  if (error === null) {
    return `[Command Center] The feature ${name} started in its own session. Confirm this to the user in words and say where to continue: the Open session button on the card, or the Features group in the sidebar.`
  }
  return `[Command Center] The feature ${name} did not start. ${error} Nothing was retried. Report this to the user and wait for them.`
}

/** The first prompt of a feature session: `/flow`, the description, and where it works; with a brief, where to read it first. */
export function featureFirstPrompt(feature: Pick<FeatureRecord, 'name' | 'worktreePath'>, description: string, previewBrowser = false, briefPath?: string): string {
  return [
    `/flow ${description.trim()}`,
    '',
    `Feature name: ${feature.name}`,
    `Feature worktree: ${feature.worktreePath}`,
    ...(briefPath ? [`Starting brief: ${briefPath} (agreed in the main chat; read it first, it holds what was already decided)`] : []),
    ...(previewBrowser ? ['Preview browser: yes'] : []),
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
