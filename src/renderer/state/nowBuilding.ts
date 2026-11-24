import { mostUrgentStatus } from '../../shared/needsYou'
import type { BoardFeature, BoardModel, BoardRepoGroup, BoardTicket, FeatureSighting, SessionStatus } from '../../shared/types'
import { featureKey, type BoardFilter } from './boardLayout'

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_ROWS = 6

export interface NowBuildingInput {
  model: BoardModel
  /** Statuses of the open hosted sessions, by workspace id. */
  statuses: Readonly<Record<string, readonly SessionStatus[]>>
  now: number
}

export interface NowBuildingRow {
  key: string
  repoGroupKey: string
  repoName: string
  featureName: string
  feature: BoardFeature
  finished: boolean
  inProgress: BoardTicket[]
  /** Null when none of the feature's workspaces has a session open. */
  status: SessionStatus | null
  /** Set when every recently changed copy is in a worktree. */
  worktreeTag: string | null
  lastActivity: number | null
}

export interface NowBuilding {
  rows: NowBuildingRow[]
  hidden: NowBuildingRow[]
  count: number
}

function isRecent(at: number | null, now: number): at is number {
  return at !== null && now - at <= ACTIVE_WINDOW_MS
}

function newestOf(sightings: FeatureSighting[]): FeatureSighting | null {
  let best: FeatureSighting | null = null
  for (const s of sightings) {
    if (s.lastActivity !== null && (best?.lastActivity == null || s.lastActivity > best.lastActivity)) best = s
  }
  return best
}

/** A worktree tag only when every recently changed copy (or the newest copy, if none is recent) is a worktree. */
function worktreeTagOf(feature: BoardFeature, input: NowBuildingInput): string | null {
  const recent = feature.sightings.filter((s) => isRecent(s.lastActivity, input.now))
  const newest = newestOf(recent.length > 0 ? recent : feature.sightings)
  const considered = recent.length > 0 ? recent : newest ? [newest] : []
  if (!newest || considered.some((s) => !s.worktreeTag)) return null
  return newest.worktreeTag
}

function mostRecentByWorkspace(group: BoardRepoGroup): Map<string, BoardFeature> {
  const best = new Map<string, { feature: BoardFeature; at: number }>()
  for (const feature of group.features) {
    for (const s of feature.sightings) {
      if (s.lastActivity === null) continue
      const known = best.get(s.workspaceId)
      if (!known || s.lastActivity > known.at) best.set(s.workspaceId, { feature, at: s.lastActivity })
    }
  }
  return new Map([...best].map(([id, { feature }]) => [id, feature]))
}

function isActive(feature: BoardFeature, input: NowBuildingInput, recent: Map<string, BoardFeature>): boolean {
  if (isRecent(feature.lastActivity, input.now)) return true
  if (feature.state === 'finished') return false
  if (feature.tickets.some((t) => t.column === 'in-progress')) return true
  return feature.sightings.some(
    (s) => input.statuses[s.workspaceId]?.includes('running') && recent.get(s.workspaceId) === feature
  )
}

function rowOf(group: BoardRepoGroup, feature: BoardFeature, input: NowBuildingInput): NowBuildingRow {
  const workspaceIds = feature.sightings.map((s) => s.workspaceId)
  const open = workspaceIds.filter((id) => (input.statuses[id]?.length ?? 0) > 0)
  return {
    key: featureKey(group.repoGroupKey, feature.name),
    repoGroupKey: group.repoGroupKey,
    repoName: group.repoName,
    featureName: feature.name,
    feature,
    finished: feature.state === 'finished',
    inProgress: feature.tickets.filter((t) => t.column === 'in-progress'),
    status: open.length > 0 ? mostUrgentStatus(open.flatMap((id) => input.statuses[id])) : null,
    worktreeTag: worktreeTagOf(feature, input),
    lastActivity: feature.lastActivity
  }
}

function newestFirst(a: NowBuildingRow, b: NowBuildingRow): number {
  if (a.lastActivity !== b.lastActivity) {
    if (a.lastActivity === null) return 1
    if (b.lastActivity === null) return -1
    return b.lastActivity - a.lastActivity
  }
  return a.featureName.localeCompare(b.featureName) || a.repoGroupKey.localeCompare(b.repoGroupKey)
}

export function nowBuilding(input: NowBuildingInput): NowBuilding {
  const rows: NowBuildingRow[] = []
  for (const group of input.model.repoGroups) {
    const recent = mostRecentByWorkspace(group)
    for (const feature of group.features) {
      if (isActive(feature, input, recent)) rows.push(rowOf(group, feature, input))
    }
  }
  rows.sort(newestFirst)
  return { rows: rows.slice(0, MAX_ROWS), hidden: rows.slice(MAX_ROWS), count: rows.length }
}

export function isFeatureFilterOn(filter: BoardFilter, key: string): boolean {
  return filter.featureKeys.length === 1 && filter.featureKeys[0] === key
}

/** A repo filter that leaves out the feature's repo is dropped, or the board would ignore the feature filter. */
export function toggleFeatureFilter(filter: BoardFilter, repoGroupKey: string, key: string): BoardFilter {
  if (isFeatureFilterOn(filter, key)) return { ...filter, featureKeys: [] }
  const keepsRepo = filter.repoGroupKeys.length === 0 || filter.repoGroupKeys.includes(repoGroupKey)
  return { ...filter, repoGroupKeys: keepsRepo ? filter.repoGroupKeys : [], featureKeys: [key] }
}

/** Only that feature, with no search left that could hide its tickets. */
export function showOnlyFeature(filter: BoardFilter, repoGroupKey: string, key: string): BoardFilter {
  return { ...toggleFeatureFilter({ ...filter, featureKeys: [] }, repoGroupKey, key), search: '' }
}

export const MINUTE_MS = 60_000

/** How long since `then`, e.g. "5m", "2h", "3d"; null under a minute. */
export function elapsed(then: number, now: number): string | null {
  const minutes = Math.floor((now - then) / MINUTE_MS)
  if (minutes < 1) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function timeAgo(then: number, now: number): string {
  const span = elapsed(then, now)
  return span ? `${span} ago` : 'just now'
}
