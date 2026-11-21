import { describe, expect, it } from 'vitest'
import { applyRateLimitEvent, readUsage } from './usageReply'
import initializeReply from '../claude/fixtures/initialize-reply.json'
import usageReply from '../claude/fixtures/get-usage-reply.json'

const INIT = initializeReply.response.response
const USAGE = usageReply.response.response

describe('readUsage', () => {
  it('takes the account from initialize and the weekly window from a real get_usage reply, hiding the null 5-hour one', () => {
    const reading = readUsage(INIT, USAGE)
    expect(reading).toEqual({
      account: { email: 'someone@example.com', organization: 'Example Organization', subscriptionType: 'Claude Ultra' },
      sevenDay: { utilization: 69, resetsAt: Date.parse('2026-11-23T22:59:59.860Z') }
    })
    expect('fiveHour' in reading).toBe(false)
  })

  it('reads both windows when both are reported', () => {
    const reading = readUsage(INIT, {
      rate_limits: {
        five_hour: { utilization: 42, resets_at: '2026-11-21T22:00:00+00:00' },
        seven_day: { utilization: 5, resets_at: null }
      }
    })
    expect(reading.fiveHour).toEqual({ utilization: 42, resetsAt: Date.parse('2026-11-21T22:00:00Z') })
    expect(reading.sevenDay).toEqual({ utilization: 5, resetsAt: null })
  })

  it("falls back to get_usage's plan name when initialize has none", () => {
    expect(readUsage({ account: { email: 'a@b.c' } }, { subscription_type: 'max' }).account).toEqual({
      email: 'a@b.c',
      subscriptionType: 'Max'
    })
  })

  it('has no account when initialize reports none', () => {
    expect(readUsage({}, {}).account).toBeNull()
  })
})

describe('applyRateLimitEvent', () => {
  const before = {
    fiveHour: { utilization: 10, resetsAt: 1_000 },
    sevenDay: { utilization: 60, resetsAt: 2_000 }
  }

  it('replaces the windows a rate_limit_event carries, turning fractions into percent and seconds into ms', () => {
    const after = applyRateLimitEvent(before, {
      status: 'allowed',
      unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: 1_800_000_000 } }
    })
    expect(after).toEqual({
      fiveHour: { utilization: 42, resetsAt: 1_800_000_000_000 },
      sevenDay: { utilization: 60, resetsAt: 2_000 }
    })
  })

  it('reads the limiting window from rateLimitType when unifiedWindows is missing', () => {
    const after = applyRateLimitEvent(before, {
      status: 'allowed_warning',
      rateLimitType: 'seven_day',
      utilization: 0.83,
      resetsAt: 1_800_000_000
    })
    expect(after.sevenDay).toEqual({ utilization: 83, resetsAt: 1_800_000_000_000 })
    expect(after.fiveHour).toEqual(before.fiveHour)
  })

  it('leaves the windows alone when the event says nothing usable', () => {
    expect(applyRateLimitEvent(before, { status: 'allowed' })).toEqual(before)
  })
})
