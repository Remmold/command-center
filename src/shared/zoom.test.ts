import { describe, expect, it } from 'vitest'
import { savedZoomLevel, zoomPercent, zoomStep, ZOOM_DEFAULT_LEVEL } from './zoom'

describe('window zoom', () => {
  it('starts at 110% when nothing was saved', () => {
    expect(zoomPercent(savedZoomLevel(undefined))).toBe(110)
    expect(zoomPercent(savedZoomLevel(null))).toBe(110)
  })

  it('starts at 110% when the saved value is not a level', () => {
    expect(zoomPercent(savedZoomLevel('big'))).toBe(110)
    expect(zoomPercent(savedZoomLevel(Number.NaN))).toBe(110)
  })

  it('keeps a level the user set, even 100%', () => {
    expect(savedZoomLevel(0)).toBe(0)
    expect(savedZoomLevel(2)).toBe(2)
  })

  it('a step is one zoom level, about 20%, like VS Code', () => {
    expect(zoomPercent(zoomStep(0, 'in'))).toBe(120)
    expect(zoomPercent(zoomStep(0, 'out'))).toBe(83)
    expect(zoomPercent(zoomStep(ZOOM_DEFAULT_LEVEL, 'in'))).toBe(132)
    expect(zoomPercent(zoomStep(ZOOM_DEFAULT_LEVEL, 'out'))).toBe(92)
  })

  it('reset goes back to 110%', () => {
    expect(zoomPercent(zoomStep(3, 'reset'))).toBe(110)
  })

  it('stops at VS Code limits of -8 and +8', () => {
    expect(zoomStep(8, 'in')).toBe(8)
    expect(zoomStep(7.5, 'in')).toBe(8)
    expect(zoomStep(-8, 'out')).toBe(-8)
    expect(savedZoomLevel(20)).toBe(8)
    expect(savedZoomLevel(-20)).toBe(-8)
  })
})
