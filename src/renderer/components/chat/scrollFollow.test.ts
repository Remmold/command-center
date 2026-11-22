import { describe, expect, it } from 'vitest'
import { followsAfterScroll, isAtBottom } from './scrollFollow'

describe('scroll-follow rule', () => {
  it('follows new output when the view is scrolled to the very bottom', () => {
    expect(isAtBottom({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 600 })).toBe(true)
  })

  it('still follows within the extension’s 50 px of the bottom', () => {
    expect(isAtBottom({ scrollHeight: 2000, scrollTop: 1351, clientHeight: 600 })).toBe(true)
  })

  it('stays put once the reader is 50 px or more above the bottom', () => {
    expect(isAtBottom({ scrollHeight: 2000, scrollTop: 1350, clientHeight: 600 })).toBe(false)
    expect(isAtBottom({ scrollHeight: 2000, scrollTop: 200, clientHeight: 600 })).toBe(false)
  })

  it('follows a view whose content is shorter than the pane', () => {
    expect(isAtBottom({ scrollHeight: 400, scrollTop: 0, clientHeight: 600 })).toBe(true)
  })
})

describe('following after a scroll', () => {
  const box = (scrollTop: number) => ({ scrollHeight: 2000, scrollTop, clientHeight: 600 })

  it('stops following when the reader scrolls up away from the bottom', () => {
    expect(followsAfterScroll({ following: true, previousTop: 1400, box: box(900) })).toBe(false)
  })

  it('keeps following when output grew before the app’s own scroll to the bottom was reported', () => {
    // The app set scrollTop to the old bottom; by the time the scroll event runs the content is taller.
    expect(followsAfterScroll({ following: true, previousTop: 300, box: box(680) })).toBe(true)
  })

  it('keeps following when lazy messages clamped the app’s own scroll lower before it was reported', () => {
    // Seen in the smoke run: set to 936, content shrank so the box clamped to 793, then grew to 1361.
    const clamped = { scrollHeight: 1361, scrollTop: 793, clientHeight: 252 }
    expect(followsAfterScroll({ following: true, previousTop: 936, box: clamped, ownTop: 793 })).toBe(true)
  })

  it('still stops following when the reader scrolls up past where the app put the box', () => {
    const read = { scrollHeight: 1361, scrollTop: 500, clientHeight: 252 }
    expect(followsAfterScroll({ following: true, previousTop: 936, box: read, ownTop: 793 })).toBe(false)
  })

  it('starts following again once the reader scrolls back to the bottom', () => {
    expect(followsAfterScroll({ following: false, previousTop: 900, box: box(1390) })).toBe(true)
  })

  it('does not start following on a scroll down that stops short of the bottom', () => {
    expect(followsAfterScroll({ following: false, previousTop: 200, box: box(900) })).toBe(false)
  })
})
