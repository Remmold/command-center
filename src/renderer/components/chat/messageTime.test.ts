import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayBreaks, dayLabel, stampLabel, stampTitle } from './messageTime'

const UTC = 'UTC'
const at = (iso: string): number => Date.parse(iso)

describe('message timestamps', () => {
  it('shows the time as the extension does: 12-hour, no leading zero', () => {
    expect(stampLabel(at('2026-11-22T15:07:42Z'), UTC)).toBe('3:07 PM')
    expect(stampLabel(at('2026-11-22T09:30:00Z'), UTC)).toBe('9:30 AM')
  })

  it('gives the full date, 24-hour time and zone on hover', () => {
    expect(stampTitle(at('2026-11-22T15:07:42Z'), UTC)).toBe('2026-11-22 15:07:42 UTC')
  })
})

describe('day lines', () => {
  const now = at('2026-11-22T12:00:00Z')

  it('names the day, adding the year only when it is not this year', () => {
    expect(dayLabel(at('2026-11-22T08:00:00Z'), now, UTC)).toBe('Sun, Nov 22')
    expect(dayLabel(at('2025-11-21T08:00:00Z'), now, UTC)).toBe('Fri, Nov 21, 2025')
  })

  it('marks the first stamped message and each one where the day changes', () => {
    const times = [undefined, at('2026-11-21T23:00:00Z'), at('2026-11-21T23:30:00Z'), undefined, at('2026-11-22T00:10:00Z')]
    expect(dayBreaks(times, UTC)).toEqual([undefined, times[1], undefined, undefined, times[4]])
  })
})

describe('formatters', () => {
  afterEach(() => vi.restoreAllMocks())

  // A long chat formats every stamp on each render; building a DateTimeFormat each time cost about 100 ms per click.
  it('builds one formatter per format and zone, however many times are formatted', () => {
    const Real = Intl.DateTimeFormat
    const built = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((...args) => new Real(...args))
    const times = Array.from({ length: 50 }, (_, i) => at('2026-11-22T12:00:00Z') + i * 60_000)
    for (const t of times) {
      stampLabel(t, 'Europe/Oslo')
      stampTitle(t, 'Europe/Oslo')
    }
    dayBreaks(times, 'Europe/Oslo')
    expect(built.mock.calls.length).toBeLessThanOrEqual(3)
    expect(stampLabel(times[0], 'Europe/Oslo')).toBe('1:00 PM')
  })
})
