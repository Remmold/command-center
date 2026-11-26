import { app, screen, type BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { userDataPath } from '../util/paths'
import { pairPlaceKey, restorePlace, type DisplayInfo, type Placement, type SavedPlace } from './place'

const SAVE_DEBOUNCE_MS = 500

/** Which window a place belongs to; the main window's file keeps its original name. */
export type WindowKey = 'main' | 'test-flow' | ReturnType<typeof pairPlaceKey>

function placeFile(key: WindowKey): string {
  return userDataPath(key === 'main' ? 'window-place.json' : `window-place-${key}.json`)
}

function displayInfo(d: Electron.Display): DisplayInfo {
  return { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }
}

/** Read synchronously, because the window needs its bounds before it is first shown. */
export function savedPlacement(key: WindowKey = 'main'): Placement | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(placeFile(key), 'utf-8'))
  } catch {
    return null
  }
  return restorePlace(raw, screen.getAllDisplays().map(displayInfo), displayInfo(screen.getPrimaryDisplay()))
}

function capture(win: BrowserWindow): SavedPlace {
  const bounds = win.getNormalBounds()
  const display = screen.getDisplayMatching(bounds)
  return {
    bounds,
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
    display: { id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor }
  }
}

function write(key: WindowKey, place: SavedPlace): void {
  const file = placeFile(key)
  try {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(place), 'utf-8')
    renameSync(tmp, file)
  } catch (err) {
    console.error('[window] could not save the window place', err)
  }
}

const flushes = new Map<WindowKey, () => void>()

/** The update install quits without closing the windows first. */
export function flushWindowPlace(): void {
  for (const flush of flushes.values()) flush()
}

export function trackWindowPlace(win: BrowserWindow, key: WindowKey = 'main'): void {
  let timer: NodeJS.Timeout | null = null
  // Before its first show a window has not had its maximised state applied, and minimised it reports none.
  let shown = win.isVisible()
  win.once('show', () => (shown = true))
  const save = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!win.isDestroyed() && shown && !win.isMinimized()) write(key, capture(win))
  }
  const later = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_DEBOUNCE_MS)
  }
  win.on('move', later)
  win.on('resize', later)
  win.on('maximize', later)
  win.on('unmaximize', later)
  win.on('enter-full-screen', later)
  win.on('leave-full-screen', later)
  win.on('close', save)
  app.on('before-quit', save)
  win.on('closed', () => {
    if (timer) clearTimeout(timer)
    app.removeListener('before-quit', save)
    if (flushes.get(key) === save) flushes.delete(key)
  })
  flushes.set(key, save)
}
