export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}

/** What `window-place.json` holds: the un-maximised bounds, the state on top, and the display they were on. */
export interface SavedPlace {
  bounds: Rect
  maximized: boolean
  fullScreen: boolean
  display: { id: number; bounds: Rect; scaleFactor: number }
}

export interface Placement {
  bounds: Rect
  maximized: boolean
  fullScreen: boolean
}

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  const finite = ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))
  return finite && (r.width as number) > 0 && (r.height as number) > 0
}

export function parsePlace(raw: unknown): SavedPlace | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  const display = p.display as Record<string, unknown> | undefined
  if (!isRect(p.bounds) || typeof display !== 'object' || display === null) return null
  if (typeof display.id !== 'number' || !isRect(display.bounds) || typeof display.scaleFactor !== 'number') return null
  return {
    bounds: p.bounds,
    maximized: p.maximized === true,
    fullScreen: p.fullScreen === true,
    display: { id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor }
  }
}

const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

export function restorePlace(raw: unknown, displays: DisplayInfo[], primary: DisplayInfo): Placement | null {
  const saved = parsePlace(raw)
  if (!saved) return null
  const state = { maximized: saved.maximized, fullScreen: saved.fullScreen }
  const keep = { bounds: saved.bounds, ...state }
  const home = displays.find((d) => d.id === saved.display.id)
  if (home && sameRect(home.bounds, saved.display.bounds) && titleBarShows(saved.bounds, home.workArea)) return keep
  if (displays.some((d) => titleBarShows(saved.bounds, d.workArea))) return keep
  if (home) {
    const moved = {
      ...saved.bounds,
      x: saved.bounds.x + home.bounds.x - saved.display.bounds.x,
      y: saved.bounds.y + home.bounds.y - saved.display.bounds.y
    }
    return { bounds: clampInto(moved, home.workArea), ...state }
  }
  return { bounds: centreIn(saved.bounds, primary.workArea), ...state }
}

/** Enough of the title bar to grab and drag the window back. */
const TITLE_BAR_PX = 32
const MIN_VISIBLE_PX = 100

function titleBarShows(bounds: Rect, area: Rect): boolean {
  const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  const height = Math.min(bounds.y + TITLE_BAR_PX, area.y + area.height) - Math.max(bounds.y, area.y)
  return width >= MIN_VISIBLE_PX && height >= TITLE_BAR_PX
}

function clampInto(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height
  }
}

function centreIn(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height
  }
}
