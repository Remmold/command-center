import { describe, expect, it } from 'vitest'
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
