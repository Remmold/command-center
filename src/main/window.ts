import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc-channels'
import type { AppView } from '../shared/types'
import type { Onscreen } from './attention/attention'
import { getScreenFocus } from './sessions/screenFocus'
import { applyZoom, zoomLevel } from './zoom/service'
import { zoomFactor } from '../shared/zoom'
import { OFFSCREEN_POSITION, windowOffscreen } from './testWindow'

let mainWindow: BrowserWindow | null = null
const offscreen = windowOffscreen(process.env)
let quitting = false

/** After this, closing the window really closes it instead of hiding to the tray. */
export function allowWindowClose(): void {
  quitting = true
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function createMainWindow(options: { show?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    // Test runs open off-screen and are shown without focus, so they never land on the user's desktop.
    show: offscreen ? false : (options.show ?? true),
    ...(offscreen ? { ...OFFSCREEN_POSITION, skipTaskbar: true } : {}),
    width: 1400,
    height: 900,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: zoomFactor(zoomLevel())
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('did-finish-load', () => applyZoom(win))

  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  if (offscreen && (options.show ?? true)) win.showInactive()
  mainWindow = win
  return win
}

export function showMainWindow(): BrowserWindow {
  const win = getMainWindow() ?? createMainWindow()
  if (win.isMinimized()) win.restore()
  if (offscreen) {
    win.showInactive()
    return win
  }
  win.show()
  win.focus()
  return win
}

export function onscreen(): Onscreen {
  const win = getMainWindow()
  const focus = getScreenFocus()
  // The renderer's document stays "visible" behind other windows, so the OS window state decides too.
  const windowShowing =
    !!win && win.isVisible() && !win.isMinimized() && win.isFocused() && focus.windowVisible
  return { paneId: focus.paneId, windowShowing }
}

function sendWhenLoaded(win: BrowserWindow, channel: string, payload: unknown): void {
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => win.webContents.send(channel, payload))
  } else {
    win.webContents.send(channel, payload)
  }
}

export function showView(view: AppView): void {
  sendWhenLoaded(showMainWindow(), IPC.NAVIGATION_SHOW_VIEW, view)
}

export function showSession(paneId: string): void {
  sendWhenLoaded(showMainWindow(), IPC.NAVIGATION_OPEN_SESSION, paneId)
}
