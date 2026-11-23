import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../../shared/chatItems'
import { formatCostEstimate, sessionCostEstimate } from './sessionCost'

const result = (id: string, costUsd?: number): ChatItem =>
  ({ kind: 'result', id, costUsd, isError: false, raw: { type: 'result' } }) as unknown as ChatItem

describe('the session cost estimate', () => {
  it('is the latest result’s running total, not a sum of turns (real CLI: 0.0061 then 0.0092)', () => {
    expect(sessionCostEstimate([result('a', 0.0061314), result('b', 0.00915266)])).toBe(0.00915266)
  })

  it('skips results without a cost and is undefined before any result', () => {
    expect(sessionCostEstimate([result('a', 0.5), result('b')])).toBe(0.5)
    expect(sessionCostEstimate([])).toBeUndefined()
  })

  it('formats cents, and tiny amounts as under a cent', () => {
    expect(formatCostEstimate(0.004)).toBe('< $0.01')
    expect(formatCostEstimate(12.3456)).toBe('$12.35')
  })
})
