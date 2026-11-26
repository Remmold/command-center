import { join } from 'node:path'
import type { FeatureServerView } from '../../shared/featureServers'
import { serversNote } from '../../shared/featureServers'
import type { FeatureStageView } from '../../shared/featureStage'
import { lastResultNote } from '../../shared/testSteps'
import type { ProfileUsage, SessionStatus } from '../../shared/types'

export const digestFileName = 'feature-digest.md'

/** The usage window holding an account at its limit, until `resetsAt` (epoch ms). */
export interface DigestRateLimit {
  window: string
  resetsAt: number | null
}

/** One feature with every fact the digest names, already resolved from the app's stores. */
export interface DigestFeature {
  name: string
  /** Null when the feature's workspace was removed. */
  workspaceName: string | null
  worktreePath: string
  completedAt: number | null
  /** Null when the account's profile was removed. */
  accountName: string | null
  status: SessionStatus
  /** Undefined until the stage was first read. */
  stage: FeatureStageView | undefined
  servers: readonly FeatureServerView[]
  rateLimit: DigestRateLimit | null
}

export function digestHeader(writtenAt: number): string {
  return `Feature digest: every feature Command Center tracks and where it stands, written ${new Date(writtenAt).toISOString()}. Read the named folder for detail.`
}

function stageLine(stage: FeatureStageView | undefined): string {
  if (!stage) return 'not read yet'
  return stage.missing ? 'worktree folder missing' : stage.stage
}

function ticketsLine(stage: FeatureStageView | undefined): string {
  if (!stage || stage.missing) return 'unknown'
  return `${stage.done}/${stage.total} done`
}

function testLine(stage: FeatureStageView | undefined): string {
  const note = stage && !stage.missing && stage.tests ? lastResultNote(stage.tests) : ''
  return note || 'none yet'
}

function serversLine(servers: readonly FeatureServerView[]): string {
  const note = serversNote(servers)
  if (!note) return 'not started'
  return `${note} (${servers.map((s) => `${s.name} ${s.status}`).join(', ')})`
}

function rateLimitLine(limit: DigestRateLimit | null): string {
  if (!limit) return 'no'
  const reset = limit.resetsAt === null ? '' : `, resets ${new Date(limit.resetsAt).toISOString()}`
  return `limited (${limit.window} window${reset})`
}

function block(f: DigestFeature): string[] {
  return [
    `## ${f.name}`,
    `- Workspace: ${f.workspaceName ?? 'removed'}`,
    `- Stage: ${stageLine(f.stage)}`,
    `- Tickets: ${ticketsLine(f.stage)}`,
    `- Session: ${f.status}`,
    `- Account: ${f.accountName ?? 'removed'}`,
    `- Rate limit: ${rateLimitLine(f.rateLimit)}`,
    `- Last test result: ${testLine(f.stage)}`,
    `- Servers: ${serversLine(f.servers)}`,
    `- Worktree: ${f.worktreePath}`,
    `- Read: ${join(f.worktreePath, '.scratch', f.name)}`,
    ''
  ]
}

/** Everything after the header; what decides whether the file needs writing again. */
export function digestBody(features: readonly DigestFeature[]): string {
  const active = features.filter((f) => f.completedAt === null)
  const completed = features.filter((f) => f.completedAt !== null)
  const lines: string[] = ['# Features in progress', '']
  if (active.length === 0) lines.push('No features in progress.', '')
  for (const f of active) lines.push(...block(f))
  if (completed.length > 0) {
    lines.push('# Completed', '')
    for (const f of completed) lines.push(`- ${f.name} (${f.workspaceName ?? 'workspace removed'}, ${f.accountName ?? 'account removed'})`)
    lines.push('')
  }
  return lines.join('\n')
}

export function renderFeatureDigest(features: readonly DigestFeature[], writtenAt: number): string {
  return `${digestHeader(writtenAt)}\n${digestBody(features)}`
}

const WINDOWS = [
  { key: 'fiveHour', label: '5-hour' },
  { key: 'sevenDay', label: '7-day' }
] as const

/** The window that has used all of its allowance and has not reset yet; null when the account can work. */
export function rateLimitOf(usage: Pick<ProfileUsage, 'fiveHour' | 'sevenDay'> | undefined, now: number): DigestRateLimit | null {
  for (const { key, label } of WINDOWS) {
    const reading = usage?.[key]
    if (reading && reading.utilization >= 100 && (reading.resetsAt === null || reading.resetsAt > now)) return { window: label, resetsAt: reading.resetsAt }
  }
  return null
}
