import { describe, expect, it } from 'vitest'
import { panelLeft } from './Popover'

describe('popover placement', () => {
  it('slides a right-aligned menu in when its button sits near the left edge (the Work list row menu)', () => {
    expect(panelLeft(205 - 300, 300, 1700)).toBe(8)
  })

  it('slides a menu in from the right edge', () => {
    expect(panelLeft(1600, 300, 1700)).toBe(1700 - 300 - 8)
  })

  it('leaves a menu that fits where it was asked to be', () => {
    expect(panelLeft(400, 300, 1700)).toBe(400)
  })
})
