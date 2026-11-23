import { describe, expect, it } from 'vitest'
import { ACCOUNT_COLORS, accountColor } from './accountColors'

const order = ['default', 'p-work', 'p-side']

describe('account accent colours', () => {
  it('follow Settings order by default', () => {
    expect(order.map((id) => accountColor(id, order, {}))).toEqual(['blue', 'orange', 'purple'])
  })

  it('use the colour picked in Settings over the default', () => {
    expect(accountColor('p-work', order, { 'p-work': 'green' })).toBe('green')
  })

  it('wrap around the palette and ignore a saved colour the palette no longer has', () => {
    const many = Array.from({ length: ACCOUNT_COLORS.length + 1 }, (_, i) => `p${i}`)
    expect(accountColor(`p${ACCOUNT_COLORS.length}`, many, {})).toBe('blue')
    expect(accountColor('p-work', order, { 'p-work': 'chartreuse' })).toBe('orange')
  })

  it('is neutral for an unknown account', () => {
    expect(accountColor(null, order, {})).toBeNull()
  })
})
