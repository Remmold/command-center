import type { AccountProfile, ProfileUsage, UsageWindowReading } from '../../shared/types'
import { elapsedShare, pace, type Pace } from './usagePace'

export type WindowTone = 'ok' | 'warn' | 'limit'
export type WindowKey = 'fiveHour' | 'sevenDay'

export interface UsageBarView {
  key: WindowKey
  label: string
  /** Whole percent used, 0-100. */
  percent: number
  tone: WindowTone
  /** The extension's wording after "Resets ", e.g. "Mon, Nov 23 at 11:59 PM"; null when unknown. */
  resetText: string | null
  /** Whole percent of the window already passed; null without a reset time. */
  elapsed: number | null
  pace: Pace | null
  /** e.g. "48% of the week passed · on track"; null without a reset time. */
  paceNote: string | null
  /** One short line, e.g. "Week 62% · ahead by 14% · resets Mon 23:59". */
  line: string
  tooltip: string
}

export type UsageEntryState = 'ready' | 'loading' | 'error' | 'not-logged-in'

export interface UsageEntry {
  profileId: string
  /** The account email, else the profile name. */
  label: string
  profileName: string
  plan: string | null
  email: string | null
  organization: string | null
  highlighted: boolean
  state: UsageEntryState
  bars: UsageBarView[]
  updatedAt: number | null
  refreshing: boolean
  error: string | null
}

export interface UsageEntriesInput {
  profiles: ReadonlyArray<Pick<AccountProfile, 'id' | 'name' | 'loggedIn'>>
  usage: Readonly<Record<string, ProfileUsage>>
  activeProfileId: string | null
  now: number
  /** For tests; the system zone otherwise. */
  timeZone?: string
}

const MIN = 60_000
const DAY = 24 * 60 * MIN

const WINDOWS: ReadonlyArray<{ key: WindowKey; label: string; short: string; showDay: boolean; length: number; span: string }> = [
  { key: 'fiveHour', label: 'Session (5hr)', short: '5h', showDay: false, length: 5 * 60 * MIN, span: 'the 5 hours' },
  { key: 'sevenDay', label: 'Weekly (7 day)', short: 'Week', showDay: true, length: 7 * DAY, span: 'the week' }
]

export function resetIn(resetsAt: number, now: number): string {
  const mins = Math.floor((resetsAt - now) / MIN)
  if (mins <= 0) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours >= 24) return `${Math.floor(hours / 24)}d`
  return mins % 60 > 0 ? `${hours}h ${mins % 60}m` : `${hours}h`
}

/** The extension's reset wording: "soon", "at 3:00 PM" within a day, else "Mon, Nov 23 at 3:00 PM". */
export function resetAt(resetsAt: number, now: number, showDay: boolean, timeZone?: string): string {
  const left = resetsAt - now
  if (left < MIN) return 'soon'
  const when = new Date(resetsAt)
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  if (left < DAY && !showDay) return `at ${time}`
  const year = (ms: number) => new Date(ms).toLocaleDateString('en-US', { year: 'numeric', timeZone })
  const day = when.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(year(resetsAt) === year(now) ? {} : { year: 'numeric' }),
    timeZone
  })
  return `${day} at ${time}`
}

function clockShort(resetsAt: number, timeZone?: string): string {
  return new Date(resetsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
}

function resetDayShort(resetsAt: number, timeZone?: string): string {
  const day = new Date(resetsAt).toLocaleDateString('en-US', { weekday: 'short', timeZone })
  return `${day} ${clockShort(resetsAt, timeZone)}`
}

export function updatedText(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return 'Not updated yet'
  const mins = Math.floor((now - updatedAt) / MIN)
  return mins < 1 ? 'Updated just now' : `Updated ${mins} min ago`
}

function tone(percent: number): WindowTone {
  if (percent >= 100) return 'limit'
  if (percent >= 80) return 'warn'
  return 'ok'
}

function barView(
  spec: (typeof WINDOWS)[number],
  reading: UsageWindowReading,
  now: number,
  timeZone?: string
): UsageBarView {
  const percent = Math.floor(Math.min(100, Math.max(0, reading.utilization)))
  const at = reading.resetsAt
  const share = elapsedShare(at, spec.length, now)
  const elapsed = share === null ? null : Math.floor(share * 100)
  const verdict = elapsed === null ? null : pace(percent, elapsed)
  const paceNote = elapsed === null || !verdict ? null : `${elapsed}% of ${spec.span} passed · ${verdict.text}`
  const parts = [`${percent}% used`]
  if (paceNote) parts.push(paceNote)
  if (at !== null) parts.push(`resets ${spec.showDay ? resetDayShort(at, timeZone) : `in ${resetIn(at, now)}`}`)
  const line = [
    `${spec.short} ${percent}%`,
    ...(verdict ? [verdict.ahead ? `ahead by ${verdict.by}%` : verdict.text] : []),
    ...(at === null ? [] : [`resets ${spec.showDay ? resetDayShort(at, timeZone) : clockShort(at, timeZone)}`])
  ].join(' · ')
  return {
    key: spec.key,
    label: spec.label,
    percent,
    tone: tone(percent),
    resetText: at === null ? null : resetAt(at, now, spec.showDay, timeZone),
    elapsed,
    pace: verdict,
    paceNote,
    line,
    tooltip: `${spec.label}: ${parts.join(' · ')}`
  }
}

/** The usage service re-reads credentials on every check, so its word beats the profile list's. */
function entryState(loggedIn: boolean, usage: ProfileUsage | undefined): UsageEntryState {
  if (!(usage ? usage.loggedIn : loggedIn)) return 'not-logged-in'
  if (!usage || usage.updatedAt === null) return usage?.error ? 'error' : 'loading'
  return 'ready'
}

/** One entry per account profile for the usage strip, its popover and the Dashboard. */
export function usageEntries(input: UsageEntriesInput): UsageEntry[] {
  return input.profiles.map((profile) => {
    const usage = input.usage[profile.id]
    const state = entryState(profile.loggedIn, usage)
    const account = state === 'not-logged-in' ? null : (usage?.account ?? null)
    const bars =
      state === 'ready' && usage
        ? WINDOWS.flatMap((spec) => {
            const reading = usage[spec.key]
            return reading ? [barView(spec, reading, input.now, input.timeZone)] : []
          })
        : []
    return {
      profileId: profile.id,
      label: account?.email ?? profile.name,
      profileName: profile.name,
      plan: account?.subscriptionType ?? null,
      email: account?.email ?? null,
      organization: account?.organization ?? null,
      highlighted: profile.id === input.activeProfileId,
      state,
      bars,
      updatedAt: usage?.updatedAt ?? null,
      refreshing: usage?.refreshing ?? false,
      error: usage?.error ?? null
    }
  })
}
