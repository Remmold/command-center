import { DEFAULT_PROFILE_ID } from '../../shared/types'

export interface ModelTokens {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export interface RawModelUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

export interface SessionUsage {
  costUsd: number
  durationMs: number
  turns: number
  tokensByModel: Record<string, ModelTokens>
}

/** One account profile's tally for a single day. */
export interface ProfileUsage {
  todayKey: string
  todayCostUsd: number
  tokensByModel: Record<string, ModelTokens>
}

export interface UsageTallies {
  /** Keyed by pane id. */
  sessions: Record<string, SessionUsage>
  /** Keyed by account profile id. */
  profiles: Record<string, ProfileUsage>
}

export interface ResultUsage {
  costUsd: number
  durationMs: number
  modelUsage?: Record<string, RawModelUsage>
  today: string
}

export function dateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function emptyTallies(): UsageTallies {
  return { sessions: {}, profiles: {} }
}

function emptyTokens(): ModelTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
}

function addTokens(a: ModelTokens, b: ModelTokens): ModelTokens {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation
  }
}

function fromRaw(raw: RawModelUsage): ModelTokens {
  return {
    input: raw.inputTokens ?? 0,
    output: raw.outputTokens ?? 0,
    cacheRead: raw.cacheReadInputTokens ?? 0,
    cacheCreation: raw.cacheCreationInputTokens ?? 0
  }
}

function addModelUsage(
  into: Record<string, ModelTokens>,
  modelUsage: Record<string, RawModelUsage> | undefined
): Record<string, ModelTokens> {
  const out = { ...into }
  for (const [model, raw] of Object.entries(modelUsage ?? {})) {
    out[model] = addTokens(out[model] ?? emptyTokens(), fromRaw(raw))
  }
  return out
}

export function recordResult(
  tallies: UsageTallies,
  profileId: string,
  paneId: string,
  result: ResultUsage
): UsageTallies {
  const cost = Number.isFinite(result.costUsd) && result.costUsd > 0 ? result.costUsd : 0
  const session = tallies.sessions[paneId] ?? { costUsd: 0, durationMs: 0, turns: 0, tokensByModel: {} }
  const prior = tallies.profiles[profileId]
  const profile = prior && prior.todayKey === result.today ? prior : undefined

  return {
    sessions: {
      ...tallies.sessions,
      [paneId]: {
        costUsd: session.costUsd + cost,
        durationMs: session.durationMs + (result.durationMs ?? 0),
        turns: session.turns + 1,
        tokensByModel: addModelUsage(session.tokensByModel, result.modelUsage)
      }
    },
    profiles: {
      ...tallies.profiles,
      [profileId]: {
        todayKey: result.today,
        todayCostUsd: (profile?.todayCostUsd ?? 0) + cost,
        tokensByModel: addModelUsage(profile?.tokensByModel ?? {}, result.modelUsage)
      }
    }
  }
}

export const USAGE_VERSION = 2

interface UsageV1 {
  sessions?: Record<string, SessionUsage>
  tokensByModel?: Record<string, ModelTokens>
  todayKey?: string
  todayCostUsd?: number
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Reads a persisted tally of any version; version 1 had one tally, which belongs to Default. */
export function migrateUsage(persisted: unknown, version: number): UsageTallies {
  if (!isObject(persisted)) return emptyTallies()
  if (version >= USAGE_VERSION) {
    return {
      sessions: isObject(persisted.sessions) ? (persisted.sessions as UsageTallies['sessions']) : {},
      profiles: isObject(persisted.profiles) ? (persisted.profiles as UsageTallies['profiles']) : {}
    }
  }
  const v1 = persisted as UsageV1
  const sessions = isObject(v1.sessions) ? v1.sessions : {}
  if (typeof v1.todayKey !== 'string') return { sessions, profiles: {} }
  return {
    sessions,
    profiles: {
      [DEFAULT_PROFILE_ID]: {
        todayKey: v1.todayKey,
        todayCostUsd: typeof v1.todayCostUsd === 'number' ? v1.todayCostUsd : 0,
        tokensByModel: isObject(v1.tokensByModel) ? v1.tokensByModel : {}
      }
    }
  }
}

interface WindowUsage {
  utilization: number
  resetsAt: number
}

/** The `rate_limit_info` of a Claude `rate_limit_event`; it describes the window currently limiting. */
export interface RateLimitInfo {
  status: string
  resetsAt?: number
  rateLimitType?: string
  utilization?: number
  unifiedWindows?: Partial<Record<'five_hour' | 'seven_day' | 'seven_day_overage_included', WindowUsage>>
  overageStatus?: string
  overageResetsAt?: number
  isUsingOverage?: boolean
}

export type WindowTone = 'ok' | 'warn' | 'limit'

export interface UsageWindow {
  label: string
  tone: WindowTone
  /** Whole percent of the window used, or null when Claude did not say. */
  percent: number | null
  /** Unix seconds; null once the reset has passed. */
  resetsAt: number | null
  usingOverage: boolean
}

export interface UsageBar {
  profileId: string
  name: string
  highlighted: boolean
  window: UsageWindow | null
  todayTokens: number
  todayCostUsd: number
  tokensByModel: Record<string, ModelTokens>
}

export interface UsageStripInput {
  profiles: ReadonlyArray<{ id: string; name: string }>
  tallies: UsageTallies
  rateLimits: Record<string, RateLimitInfo>
  activeProfileId: string | null
  now: number
}

const WINDOW_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d opus',
  seven_day_sonnet: '7d sonnet',
  seven_day_overage_included: '7d',
  overage: 'overage'
}

function windowTone(status: string): WindowTone {
  if (status === 'rejected') return 'limit'
  if (status === 'allowed_warning') return 'warn'
  return 'ok'
}

function windowUtilization(info: RateLimitInfo): number | undefined {
  if (typeof info.utilization === 'number') return info.utilization
  const type = info.rateLimitType as keyof NonNullable<RateLimitInfo['unifiedWindows']> | undefined
  return type ? info.unifiedWindows?.[type]?.utilization : undefined
}

function toWindow(info: RateLimitInfo, nowSeconds: number): UsageWindow {
  const type = info.rateLimitType ?? 'five_hour'
  const label = WINDOW_LABEL[type] ?? type
  if (typeof info.resetsAt === 'number' && info.resetsAt <= nowSeconds) {
    return { label, tone: 'ok', percent: null, resetsAt: null, usingOverage: false }
  }
  const utilization = windowUtilization(info)
  return {
    label,
    tone: windowTone(info.status),
    percent: utilization === undefined ? null : Math.round(utilization * 100),
    resetsAt: info.resetsAt ?? null,
    usingOverage: info.isUsingOverage === true
  }
}

export function totalTokens(t: ModelTokens): number {
  return t.input + t.output + t.cacheRead + t.cacheCreation
}

export function buildUsageStrip(input: UsageStripInput): UsageBar[] {
  const today = dateKey(new Date(input.now))
  const named = new Map(input.profiles.map((p) => [p.id, p.name]))
  const ids = [...named.keys()]
  for (const id of [...Object.keys(input.rateLimits), ...Object.keys(input.tallies.profiles)]) {
    if (!named.has(id)) {
      named.set(id, id === DEFAULT_PROFILE_ID ? 'Default' : id)
      ids.push(id)
    }
  }

  return ids.map((profileId) => {
    const tally = input.tallies.profiles[profileId]
    const tokensByModel = tally && tally.todayKey === today ? tally.tokensByModel : {}
    const info = input.rateLimits[profileId]
    return {
      profileId,
      name: named.get(profileId) ?? profileId,
      highlighted: profileId === input.activeProfileId,
      window: info ? toWindow(info, input.now / 1000) : null,
      todayTokens: Object.values(tokensByModel).reduce((sum, t) => sum + totalTokens(t), 0),
      todayCostUsd: tally && tally.todayKey === today ? tally.todayCostUsd : 0,
      tokensByModel
    }
  })
}
