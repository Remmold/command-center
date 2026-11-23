import { describe, expect, it } from 'vitest'
import type { AccountProfile, ProfileUsage } from '../../shared/types'
import { resetAt, resetIn, updatedText, usageEntries } from './usageModel'

const NOW = Date.parse('2026-11-21T20:00:00Z')
const MIN = 60_000
const UTC = 'UTC'

const profile = (id: string, name: string, loggedIn = true): AccountProfile => ({ id, name, configDir: `C:/p/${id}`, loggedIn, adopted: false })

const usage = (over: Partial<ProfileUsage> = {}): ProfileUsage => ({
  profileId: 'default',
  loggedIn: true,
  account: { email: 'me@example.com', organization: 'Org', subscriptionType: 'Claude Ultra' },
  updatedAt: NOW - 2 * MIN,
  refreshing: false,
  ...over
})

describe('reset formatting', () => {
  it('counts down to a reset in hours and minutes', () => {
    expect(resetIn(NOW + 130 * MIN, NOW)).toBe('2h 10m')
    expect(resetIn(NOW + 45 * MIN, NOW)).toBe('45m')
    expect(resetIn(NOW + 3 * 24 * 60 * MIN, NOW)).toBe('3d')
    expect(resetIn(NOW - MIN, NOW)).toBe('now')
  })

  it("words a reset the extension's way: a time today, a day and time for weekly windows", () => {
    expect(resetAt(NOW + 30_000, NOW, false, UTC)).toBe('soon')
    expect(resetAt(NOW + 3 * 60 * MIN, NOW, false, UTC)).toBe('at 11:00 PM')
    expect(resetAt(Date.parse('2026-11-23T22:59:59.860Z'), NOW, true, UTC)).toBe('Mon, Nov 23 at 10:59 PM')
    expect(resetAt(Date.parse('2027-01-04T09:00:00Z'), NOW, true, UTC)).toBe('Mon, Jan 4, 2027 at 9:00 AM')
  })

  it('says how long ago the numbers were read', () => {
    expect(updatedText(NOW - 10_000, NOW)).toBe('Updated just now')
    expect(updatedText(NOW - 2 * MIN, NOW)).toBe('Updated 2 min ago')
    expect(updatedText(null, NOW)).toBe('Not updated yet')
  })
})

describe('usageEntries', () => {
  it('labels each profile with its email and plan and shows only the windows that came back', () => {
    const [entry] = usageEntries({
      profiles: [profile('default', 'Default')],
      usage: { default: usage({ sevenDay: { utilization: 69, resetsAt: Date.parse('2026-11-23T23:00:00Z') } }) },
      activeProfileId: null,
      now: NOW,
      timeZone: UTC
    })
    expect(entry.label).toBe('me@example.com')
    expect(entry.plan).toBe('Claude Ultra')
    expect(entry.state).toBe('ready')
    expect(entry.bars).toEqual([
      {
        key: 'sevenDay',
        label: 'Weekly (7 day)',
        percent: 69,
        tone: 'ok',
        resetText: 'Mon, Nov 23 at 11:00 PM',
        elapsed: 69,
        pace: { ahead: false, by: 0, text: 'on track' },
        paceNote: '69% of the week passed · on track',
        line: 'Week 69% · on track · resets Mon 23:00',
        tooltip: 'Weekly (7 day): 69% used · 69% of the week passed · on track · resets Mon 23:00'
      }
    ])
  })

  it('words the 5-hour tooltip as a countdown and warns from 80%', () => {
    const [entry] = usageEntries({
      profiles: [profile('default', 'Default')],
      usage: { default: usage({ fiveHour: { utilization: 83.6, resetsAt: NOW + 130 * MIN } }) },
      activeProfileId: null,
      now: NOW,
      timeZone: UTC
    })
    expect(entry.bars[0]).toMatchObject({
      label: 'Session (5hr)',
      percent: 83,
      tone: 'warn',
      resetText: 'at 10:10 PM',
      elapsed: 56,
      pace: { ahead: true, by: 27, text: 'ahead of pace by 27%' },
      tooltip: 'Session (5hr): 83% used · 56% of the 5 hours passed · ahead of pace by 27% · resets in 2h 10m',
      line: '5h 83% · ahead by 27% · resets 22:10'
    })
  })

  it('has no time-passed line for a window without a reset time', () => {
    const [entry] = usageEntries({
      profiles: [profile('default', 'Default')],
      usage: { default: usage({ sevenDay: { utilization: 10, resetsAt: null } }) },
      activeProfileId: null,
      now: NOW,
      timeZone: UTC
    })
    expect(entry.bars[0]).toMatchObject({ elapsed: null, pace: null, tooltip: 'Weekly (7 day): 10% used', line: 'Week 10%' })
  })

  it('falls back to the profile name, marks a profile without credentials, and highlights the one on screen', () => {
    const entries = usageEntries({
      profiles: [profile('default', 'Default'), profile('work', 'Work', false), profile('new', 'New')],
      usage: { default: usage({ account: null, updatedAt: null, error: 'boom' }) },
      activeProfileId: 'new',
      now: NOW,
      timeZone: UTC
    })
    expect(entries.map((e) => [e.label, e.plan, e.state, e.highlighted])).toEqual([
      ['Default', null, 'error', false],
      ['Work', null, 'not-logged-in', false],
      ['New', null, 'loading', true]
    ])
  })

  it('treats a profile the CLI reports as logged out as not logged in', () => {
    const [entry] = usageEntries({
      profiles: [profile('default', 'Default')],
      usage: { default: usage({ loggedIn: false, account: null }) },
      activeProfileId: null,
      now: NOW,
      timeZone: UTC
    })
    expect(entry.state).toBe('not-logged-in')
  })

  it("trusts the usage service's newer read over a stale profile list after a login", () => {
    const [entry] = usageEntries({
      profiles: [profile('work', 'Work', false)],
      usage: { work: usage({ profileId: 'work' }) },
      activeProfileId: null,
      now: NOW,
      timeZone: UTC
    })
    expect(entry.state).toBe('ready')
  })
})
