import { describe, expect, it } from 'vitest'
import { restorePlace, type DisplayInfo, type SavedPlace } from './place'

const left: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }
const right: DisplayInfo = { id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, workArea: { x: 1920, y: 0, width: 2560, height: 1400 }, scaleFactor: 1.5 }

function savedOn(display: DisplayInfo, bounds: SavedPlace['bounds'], extra: Partial<SavedPlace> = {}): SavedPlace {
  return { bounds, maximized: false, fullScreen: false, display: { id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor }, ...extra }
}

describe('the window reopens where it was', () => {
  it('opens at the default place when nothing was saved', () => {
    expect(restorePlace(null, [left], left)).toBeNull()
    expect(restorePlace({ bounds: 'nonsense' }, [left], left)).toBeNull()
  })

  it('keeps the exact place on the same display', () => {
    const bounds = { x: 2100, y: 120, width: 1500, height: 1000 }
    expect(restorePlace(savedOn(right, bounds), [left, right], left)).toEqual({ bounds, maximized: false, fullScreen: false })
  })

  it('moves into the primary work area when its display is gone, keeping the size', () => {
    const saved = savedOn(right, { x: 2100, y: 120, width: 1500, height: 1000 })
    expect(restorePlace(saved, [left], left)?.bounds).toEqual({ x: 210, y: 20, width: 1500, height: 1000 })
  })

  it('clamps a window bigger than the primary work area', () => {
    const saved = savedOn(right, { x: 1920, y: 0, width: 2560, height: 1400 })
    expect(restorePlace(saved, [left], left)?.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
  })

  it('follows its monitor to its new spot in a moved layout', () => {
    const movedRight: DisplayInfo = { ...right, bounds: { ...right.bounds, x: -2560 }, workArea: { ...right.workArea, x: -2560 } }
    const saved = savedOn(right, { x: 2100, y: 120, width: 1500, height: 1000 })
    expect(restorePlace(saved, [left, movedRight], left)?.bounds).toEqual({ x: -2380, y: 120, width: 1500, height: 1000 })
  })

  it('keeps the place on any display that shows its title bar when the display id changed', () => {
    const renumbered: DisplayInfo = { ...right, id: 7 }
    const bounds = { x: 2100, y: 120, width: 1500, height: 1000 }
    expect(restorePlace(savedOn(right, bounds), [left, renumbered], left)?.bounds).toEqual(bounds)
  })

  it('keeps a window that hangs off an edge while enough of its title bar shows', () => {
    const bounds = { x: 1500, y: 300, width: 1200, height: 900 }
    expect(restorePlace(savedOn(left, bounds), [left], left)?.bounds).toEqual(bounds)
  })

  it('pulls a window whose title bar is off-screen back onto its display', () => {
    const above = savedOn(left, { x: 200, y: -500, width: 1200, height: 900 })
    expect(restorePlace(above, [left], left)?.bounds).toEqual({ x: 200, y: 0, width: 1200, height: 900 })
    const sliver = savedOn(left, { x: 1860, y: 100, width: 1200, height: 900 })
    expect(restorePlace(sliver, [left], left)?.bounds).toEqual({ x: 720, y: 100, width: 1200, height: 900 })
  })

  it('re-applies maximised and full screen over the un-maximised bounds', () => {
    const bounds = { x: 100, y: 100, width: 1200, height: 800 }
    expect(restorePlace(savedOn(left, bounds, { maximized: true }), [left], left)).toEqual({ bounds, maximized: true, fullScreen: false })
    expect(restorePlace(savedOn(left, bounds, { fullScreen: true }), [left], left)).toEqual({ bounds, maximized: false, fullScreen: true })
  })

  it('keeps the saved logical size when the display now has another scale factor', () => {
    const rescaled: DisplayInfo = { ...right, scaleFactor: 1 }
    const bounds = { x: 2100, y: 120, width: 1500, height: 1000 }
    expect(restorePlace(savedOn(right, bounds), [left, rescaled], left)?.bounds).toEqual(bounds)
  })
})
