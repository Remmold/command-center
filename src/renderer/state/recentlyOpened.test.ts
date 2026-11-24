import { describe, expect, it } from 'vitest'
import { touchRecent } from './recentlyOpened'

describe('the agents whose items stay loaded', () => {
  it('puts the one just opened first and drops the oldest past the limit', () => {
    expect(touchRecent([], 'a', 3)).toEqual({ order: ['a'], dropped: [] })
    expect(touchRecent(['c', 'b', 'a'], 'd', 3)).toEqual({ order: ['d', 'c', 'b'], dropped: ['a'] })
  })

  it('never drops one still open, as in another pane', () => {
    expect(touchRecent(['c', 'b', 'a'], 'd', 3, new Set(['d', 'a']))).toEqual({ order: ['d', 'c', 'a'], dropped: ['b'] })
    expect(touchRecent(['c', 'b', 'a'], 'd', 3, new Set(['d', 'c', 'b', 'a']))).toEqual({ order: ['d', 'c', 'b', 'a'], dropped: [] })
  })

  it('moves one opened again to the front without dropping anything', () => {
    expect(touchRecent(['c', 'b', 'a'], 'a', 3)).toEqual({ order: ['a', 'c', 'b'], dropped: [] })
  })
})
