import { describe, expect, it } from 'vitest'
import { elapsedShare, pace } from './usagePace'

const HOUR = 3_600_000
const WEEK = 7 * 24 * HOUR
const NOW = Date.parse('2026-11-21T20:00:00Z')

describe('elapsed share of a usage window', () => {
  it('is the part of the window already behind us', () => {
    expect(elapsedShare(NOW + WEEK / 4, WEEK, NOW)).toBe(0.75)
    expect(elapsedShare(NOW + 4 * HOUR, 5 * HOUR, NOW)).toBeCloseTo(0.2)
  })

  it('clamps to the window: a reset further out than a window is 0, a passed reset is 1', () => {
    expect(elapsedShare(NOW + 2 * WEEK, WEEK, NOW)).toBe(0)
    expect(elapsedShare(NOW - HOUR, WEEK, NOW)).toBe(1)
  })

  it('has no share without a reset time', () => {
    expect(elapsedShare(null, WEEK, NOW)).toBeNull()
  })
})

describe('pace verdict', () => {
  it('is on track while usage is at or below the time passed', () => {
    expect(pace(48, 48)).toEqual({ ahead: false, by: 0, text: 'on track' })
    expect(pace(10, 48)).toEqual({ ahead: false, by: 0, text: 'on track' })
  })

  it('is ahead of pace by the difference once usage outruns the time passed', () => {
    expect(pace(62, 50)).toEqual({ ahead: true, by: 12, text: 'ahead of pace by 12%' })
  })
})
