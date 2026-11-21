import { describe, expect, it } from 'vitest'
import { buildUsageStrip, emptyTallies, migrateUsage, recordResult } from './usageModel'

const today = '2026-11-21'

describe('recordResult', () => {
  it('adds a result to the tally of the profile it ran on only', () => {
    const t = recordResult(emptyTallies(), 'work', 'pane-1', {
      costUsd: 0.5,
      durationMs: 1000,
      modelUsage: { 'claude-opus-4-7': { inputTokens: 10, outputTokens: 5 } },
      today
    })
    expect(t.profiles.work).toEqual({
      todayKey: today,
      todayCostUsd: 0.5,
      tokensByModel: { 'claude-opus-4-7': { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 } }
    })
    expect(t.profiles.default).toBeUndefined()
    expect(t.sessions['pane-1'].turns).toBe(1)
  })
})

describe('recordResult on a new day', () => {
  it('starts that profile over and leaves other profiles alone', () => {
    let t = recordResult(emptyTallies(), 'work', 'p1', { costUsd: 1, durationMs: 0, today: '2026-11-20' })
    t = recordResult(t, 'default', 'p2', { costUsd: 2, durationMs: 0, today: '2026-11-20' })
    t = recordResult(t, 'work', 'p1', { costUsd: 0.25, durationMs: 0, today })
    expect(t.profiles.work.todayCostUsd).toBe(0.25)
    expect(t.profiles.default.todayCostUsd).toBe(2)
  })
})

describe('migrateUsage', () => {
  it('moves a version-1 tally to the Default profile', () => {
    const v1 = {
      sessions: { p1: { costUsd: 3, durationMs: 10, turns: 2, tokensByModel: {} } },
      tokensByModel: { 'claude-sonnet-4-6': { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 } },
      todayKey: '2026-11-20',
      todayCostUsd: 3
    }
    expect(migrateUsage(v1, 1)).toEqual({
      sessions: v1.sessions,
      profiles: {
        default: {
          todayKey: '2026-11-20',
          todayCostUsd: 3,
          tokensByModel: { 'claude-sonnet-4-6': { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 } }
        }
      }
    })
  })

  it('starts empty from anything it cannot read', () => {
    expect(migrateUsage(null, 1)).toEqual(emptyTallies())
    expect(migrateUsage('junk', 0)).toEqual(emptyTallies())
  })
})

describe('buildUsageStrip', () => {
  const profiles = [
    { id: 'default', name: 'Default' },
    { id: 'work', name: 'Work' }
  ]
  const now = Date.parse('2026-11-21T12:00:00Z')
  const inOneHour = now / 1000 + 3600

  it('gives one bar per profile, in profile order, highlighting the profile on screen', () => {
    const strip = buildUsageStrip({
      profiles,
      tallies: emptyTallies(),
      rateLimits: {
        work: { status: 'allowed_warning', resetsAt: inOneHour, rateLimitType: 'five_hour', utilization: 0.83 }
      },
      activeProfileId: 'work',
      now
    })
    expect(strip.map((b) => [b.profileId, b.name, b.highlighted])).toEqual([
      ['default', 'Default', false],
      ['work', 'Work', true]
    ])
    expect(strip[0].window).toBeNull()
    expect(strip[1].window).toEqual({ label: '5h', tone: 'warn', percent: 83, resetsAt: inOneHour, usingOverage: false })
  })

  it('shows a rejected window as at the limit, and says when overage is in use', () => {
    const [bar] = buildUsageStrip({
      profiles: profiles.slice(0, 1),
      tallies: emptyTallies(),
      rateLimits: {
        default: { status: 'rejected', resetsAt: inOneHour, rateLimitType: 'seven_day', isUsingOverage: true }
      },
      activeProfileId: null,
      now
    })
    expect(bar.window).toEqual({ label: '7d', tone: 'limit', percent: null, resetsAt: inOneHour, usingOverage: true })
  })

  it('reads the five-hour window when the event names no utilization of its own', () => {
    const [bar] = buildUsageStrip({
      profiles: profiles.slice(0, 1),
      tallies: emptyTallies(),
      rateLimits: {
        default: {
          status: 'allowed',
          resetsAt: inOneHour,
          rateLimitType: 'five_hour',
          unifiedWindows: { five_hour: { utilization: 0.4, resetsAt: inOneHour } }
        }
      },
      activeProfileId: null,
      now
    })
    expect(bar.window?.percent).toBe(40)
    expect(bar.window?.tone).toBe('ok')
  })

  it('forgets the fill of a window whose reset time has passed', () => {
    const [bar] = buildUsageStrip({
      profiles: profiles.slice(0, 1),
      tallies: emptyTallies(),
      rateLimits: {
        default: { status: 'rejected', resetsAt: now / 1000 - 60, rateLimitType: 'five_hour', utilization: 1 }
      },
      activeProfileId: null,
      now
    })
    expect(bar.window).toEqual({ label: '5h', tone: 'ok', percent: null, resetsAt: null, usingOverage: false })
  })

  it("counts only today's tokens of each profile", () => {
    let tallies = recordResult(emptyTallies(), 'default', 'p1', {
      costUsd: 0,
      durationMs: 0,
      modelUsage: { 'claude-opus-4-7': { inputTokens: 100 } },
      today: '2026-11-20'
    })
    tallies = recordResult(tallies, 'work', 'p2', {
      costUsd: 0.1,
      durationMs: 0,
      modelUsage: { 'claude-opus-4-7': { inputTokens: 7, outputTokens: 3 }, 'claude-haiku-4-5': { inputTokens: 1 } },
      today
    })
    const strip = buildUsageStrip({ profiles, tallies, rateLimits: {}, activeProfileId: null, now })
    expect(strip[0].todayTokens).toBe(0)
    expect(strip[1].todayTokens).toBe(11)
    expect(strip[1].todayCostUsd).toBe(0.1)
  })

  it('still shows a bar for usage from a profile not in the list yet', () => {
    const strip = buildUsageStrip({
      profiles: [],
      tallies: emptyTallies(),
      rateLimits: { default: { status: 'allowed', resetsAt: inOneHour, rateLimitType: 'five_hour' } },
      activeProfileId: 'default',
      now
    })
    expect(strip.map((b) => [b.profileId, b.name, b.highlighted])).toEqual([['default', 'Default', true]])
  })
})
