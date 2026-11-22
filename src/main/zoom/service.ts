import { BrowserWindow } from 'electron'
import { promises as fs, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { savedZoomLevel, zoomStep, type ZoomStep } from '../../shared/zoom'
import { userDataPath } from '../util/paths'

let level: number | null = null
let saving: Promise<void> = Promise.resolve()
const listeners: Array<(level: number) => void> = []

function settingsFile(): string {
  return userDataPath('zoom.json')
}

function readSaved(): unknown {
  try {
    return (JSON.parse(readFileSync(settingsFile(), 'utf-8')) as { level?: unknown } | null)?.level
  } catch {
    return undefined
  }
}

async function save(next: number): Promise<void> {
  const file = settingsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ level: next }), 'utf-8')
  await fs.rename(tmp, file)
}

/** Read synchronously once, because the window needs it before its first paint. */
export function zoomLevel(): number {
  if (level === null) level = savedZoomLevel(readSaved())
  return level
}

export function applyZoom(win: BrowserWindow): void {
  if (!win.isDestroyed()) win.webContents.setZoomLevel(zoomLevel())
}

export function stepZoom(step: ZoomStep): number {
  const next = zoomStep(zoomLevel(), step)
  level = next
  for (const win of BrowserWindow.getAllWindows()) applyZoom(win)
  saving = saving.then(() => save(next)).catch((err) => console.error('[zoom] could not save the zoom level', err))
  for (const listener of listeners) listener(next)
  return next
}

export function onZoomChanged(listener: (level: number) => void): void {
  listeners.push(listener)
}
