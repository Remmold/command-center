import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { TEST_FLOW_WINDOW_QUERY, type TestFlowFocus, type TestFlowPick } from '../../shared/testFlow'
import { OFFSCREEN_POSITION, windowOffscreen } from '../testWindow'
import { appWebPreferences, guardAppWindow, loadRenderer, revealPlaced, WINDOW_BACKGROUND } from '../window'
import { savedPlacement, trackWindowPlace } from '../windowPlace/service'

const MAX_PICKS = 64
const MAX_PATH_LENGTH = 1024
const MAX_NAME_LENGTH = 256
const MAX_TITLE_LENGTH = 500

let popOut: BrowserWindow | null = null
let focus: TestFlowFocus | null = null

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

function parsePick(raw: unknown): TestFlowPick | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { path, source } = raw as Record<string, unknown>
  if (!isText(path, MAX_PATH_LENGTH) || (source !== 'session' && source !== 'repo')) return null
  return { path, source }
}

/** Rebuilt field by field from what the renderer sent; null when any part is malformed. */
function parseTestFlowFocus(raw: unknown): TestFlowFocus | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { picks, folder, repoName, title } = raw as Record<string, unknown>
  if (!Array.isArray(picks) || picks.length > MAX_PICKS) return null
  if (!isText(folder, MAX_PATH_LENGTH) || !isText(repoName, MAX_NAME_LENGTH) || typeof title !== 'string') return null
  const parsed = picks.map(parsePick)
  if (parsed.some((p) => p === null)) return null
  return { picks: parsed as TestFlowPick[], folder, repoName, title: title.slice(0, MAX_TITLE_LENGTH) }
}

function openWindow(): BrowserWindow | null {
  return popOut && !popOut.isDestroyed() ? popOut : null
}

export function testFlowFocus(): TestFlowFocus | null {
  return focus
}

/** A focus sent before the pop-out listens is lost; it asks for the last one once it does. */
export function publishTestFlowFocus(raw: unknown): void {
  const next = parseTestFlowFocus(raw)
  if (!next) return
  focus = next
  openWindow()?.webContents.send(IPC.TEST_FLOW_FOCUS, next)
}

/** At most one; it is not hidden to the tray, so the app's quit closes it with the rest. */
export function openTestFlowWindow(): void {
  const offscreen = windowOffscreen(process.env)
  const existing = openWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    if (offscreen) existing.showInactive()
    else {
      existing.show()
      existing.focus()
    }
    return
  }
  const place = offscreen ? null : savedPlacement('test-flow')
  const win = new BrowserWindow({
    show: false,
    ...(offscreen ? { ...OFFSCREEN_POSITION, skipTaskbar: true } : {}),
    width: 800,
    height: 900,
    ...(place?.bounds ?? {}),
    title: 'Test flow',
    backgroundColor: WINDOW_BACKGROUND,
    webPreferences: appWebPreferences()
  })
  guardAppWindow(win)
  win.on('closed', () => {
    if (popOut === win) popOut = null
  })
  loadRenderer(win, TEST_FLOW_WINDOW_QUERY)
  popOut = win
  if (offscreen) {
    win.showInactive()
    return
  }
  // Set again after creation: Windows can scale constructor bounds by the wrong monitor's DPI.
  if (place) win.setBounds(place.bounds)
  trackWindowPlace(win, 'test-flow')
  revealPlaced(win, place)
}
