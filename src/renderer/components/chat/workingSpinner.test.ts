import { describe, expect, it } from 'vitest'
import { SPINNER_CYCLE, SPINNER_VERBS, padTo, typeStep, typingDone, verbDelay, workingLabel } from './workingSpinner'

const first = <T>(xs: readonly T[]): T => xs[0]
const last = <T>(xs: readonly T[]): T => xs[xs.length - 1]

describe('spinner glyph', () => {
  it('runs the six frames forward then back, as the extension', () => {
    expect(SPINNER_CYCLE.join('')).toBe('·✢*✶✻✽✽✻✶*✢·')
  })
})

describe('verb rotation', () => {
  it('waits 2s, then 3s, then 5s between verbs from then on', () => {
    expect([0, 1, 2, 3, 10].map(verbDelay)).toEqual([2000, 3000, 5000, 5000, 5000])
  })

  it('draws from the extension’s verb list', () => {
    expect(SPINNER_VERBS).toContain('Tinkering')
    expect(SPINNER_VERBS).toContain('Clauding')
    expect(SPINNER_VERBS).toHaveLength(82)
  })

  it('reads the verb with three dots', () => {
    expect(workingLabel('Tinkering')).toBe('Tinkering...')
  })
})

describe('typing a new verb in', () => {
  it('pads to a fixed width with spaces', () => {
    expect(padTo('Doing...', 12)).toBe('Doing...    ')
    expect(padTo('Doing...', 4)).toBe('Doing...')
  })

  it('puts a block cursor at the step, scrambles the two before it and settles the third', () => {
    const target = 'Baking...'
    let text = padTo('', target.length)
    text = typeStep(text, target, 0, first)
    expect(text).toBe('▌        ')
    text = typeStep(text, target, 1, first)
    expect(text).toBe('.▌       ')
    text = typeStep(text, target, 2, last)
    expect(text).toBe('Ba▌      ')
    text = typeStep(text, target, 3, first)
    expect(text).toBe('B..▌     ')
  })

  it('ends on the target once the step is three past its end', () => {
    const target = 'Doing...'
    let text = padTo('Wrangling...', target.length).slice(0, target.length)
    let index = 0
    while (!typingDone(index, target)) text = typeStep(text, target, index++, first)
    expect(text).toBe(target)
    expect(index).toBe(target.length + 3)
  })

  it('never puts the cursor or noise where the target has a space', () => {
    expect(typeStep('xy', 'a ', 1, first)).toBe('. ')
  })
})
