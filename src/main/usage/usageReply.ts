import type { ProfileUsage, UsageWindowReading } from '../../shared/types'
import { isRecord } from '../claude/controlChannel'

type Raw = Record<string, unknown>

export type UsageReading = Pick<ProfileUsage, 'account' | 'fiveHour' | 'sevenDay'>
export type UsageWindows = Pick<ProfileUsage, 'fiveHour' | 'sevenDay'>

/** The `rate_limit_info` of a running session's `rate_limit_event`: fractions and unix seconds. */
export interface RateLimitInfo {
  status?: string
  rateLimitType?: string
  utilization?: number
  resetsAt?: number
  unifiedWindows?: Partial<Record<string, { utilization?: number; resetsAt?: number }>>
}

const WINDOW_KEYS = { five_hour: 'fiveHour', seven_day: 'sevenDay' } as const

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** The extension's plan label: "max" → "Max", "team_premium" → "Team Premium"; display names pass through. */
function planName(raw: string): string {
  if (/[A-Z\s]/.test(raw)) return raw
  return raw
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function readWindow(raw: unknown): UsageWindowReading | undefined {
  if (!isRecord(raw) || typeof raw.utilization !== 'number') return undefined
  const at = typeof raw.resets_at === 'string' ? Date.parse(raw.resets_at) : NaN
  return { utilization: raw.utilization, resetsAt: Number.isNaN(at) ? null : at }
}

function readAccount(init: Raw, usage: Raw): UsageReading['account'] {
  if (!isRecord(init.account)) return null
  const account: NonNullable<UsageReading['account']> = {}
  const email = text(init.account.email)
  const organization = text(init.account.organization)
  const plan = text(init.account.subscriptionType) ?? text(usage.subscription_type)
  if (email) account.email = email
  if (organization) account.organization = organization
  if (plan) account.subscriptionType = planName(plan)
  return account
}

/** Narrows an `initialize` reply plus a `get_usage` reply to the 5-hour and weekly windows; null windows stay absent. */
export function readUsage(init: Raw, usage: Raw): UsageReading {
  const reading: UsageReading = { account: readAccount(init, usage) }
  const limits = isRecord(usage.rate_limits) ? usage.rate_limits : {}
  for (const [wire, key] of Object.entries(WINDOW_KEYS)) {
    const window = readWindow(limits[wire])
    if (window) reading[key] = window
  }
  return reading
}

function fromEvent(utilization: number | undefined, resetsAt: number | undefined): UsageWindowReading | undefined {
  if (typeof utilization !== 'number') return undefined
  return { utilization: Math.round(utilization * 10_000) / 100, resetsAt: typeof resetsAt === 'number' ? resetsAt * 1000 : null }
}

/** Folds a live `rate_limit_event` into the last reading. */
export function applyRateLimitEvent<T extends UsageWindows>(prior: T, info: RateLimitInfo): T {
  const next = { ...prior }
  for (const [wire, key] of Object.entries(WINDOW_KEYS)) {
    const unified = info.unifiedWindows?.[wire]
    const window = unified
      ? fromEvent(unified.utilization, unified.resetsAt)
      : info.rateLimitType === wire
        ? fromEvent(info.utilization, info.resetsAt)
        : undefined
    if (window) next[key] = window
  }
  return next
}
