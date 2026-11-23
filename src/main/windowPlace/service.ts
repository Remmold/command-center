import { app, screen, type BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { userDataPath } from '../util/paths'
import { restorePlace, type DisplayInfo, type Placement, type SavedPlace } from './place'

const SAVE_DEBOUNCE_MS = 500

function placeFile(): string {
  return userDataPath('window-place.json')
}

function displayInfo(d: Electron.Display): DisplayInfo {
  return { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }
}

/** Read synchronously, because the window needs its bounds before it is first shown. */
export function savedPlacement(): Placement | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(placeFile(), 'utf-8'))
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

function write(place: SavedPlace): void {
  const file = placeFile()
  try {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(place), 'utf-8')
    renameSync(tmp, file)
  } catch (err) {
    console.error('[window] could not save the window place', err)
  }
}

let flushPending: () => void = () => undefined

/** Writes any pending move or resize now; the update install calls it before quitting. */
export function flushWindowPlace(): void {
  flushPending()
}

/** Saves the window's place on every move and resize, and once more right before quit. */
export function trackWindowPlace(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const save = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!win.isDestroyed()) write(capture(win))
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
  })
  flushPending = save
}
