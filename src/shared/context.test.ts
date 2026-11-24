import { describe, expect, it } from 'vitest'
import { estimateTokens, formatTokens } from './context'

describe('token estimate', () => {
  it('is characters divided by four, rounded', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcdef')).toBe(2)
    expect(estimateTokens('abcde')).toBe(1)
  })

  it('reads as ~N below a thousand and ~N.Nk from there', () => {
    expect(formatTokens(0)).toBe('~0')
    expect(formatTokens(999)).toBe('~999')
    expect(formatTokens(1000)).toBe('~1.0k')
    expect(formatTokens(4200)).toBe('~4.2k')
    expect(formatTokens(12_345)).toBe('~12.3k')
  })
})
