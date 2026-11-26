import { BrowserWindow, screen, session, shell } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { TEST_FLOW_WINDOW_QUERY, type TestFlowFocus } from '../../shared/testFlow'
import { OFFSCREEN_POSITION, windowOffscreen } from '../testWindow'
import { appWebPreferences, guardAppWindow, loadRenderer, revealPlaced, WINDOW_BACKGROUND } from '../window'
import { pairPlaceKey, type PairRole } from '../windowPlace/place'
import { savedPlacement, trackWindowPlace } from '../windowPlace/service'
import { isPairFlipKey } from './pairHotkey'
import { previewNavigation, previewPartition, previewRequestAllowed } from './previewNavigation'
import type { PairSpec } from './testPair'

interface Pair {
  flow: BrowserWindow | null
  preview: BrowserWindow | null
  ports: number[]
}

const pairs = new Map<string, Pair>()
const flowFocus = new Map<number, TestFlowFocus>()
const guardedPartitions = new Set<string>()

const alive = (win: BrowserWindow | null | undefined): win is BrowserWindow => !!win && !win.isDestroyed()

/** The test flow a pair's test flow window shows, asked by that window; undefined for any other window. */
export function pairFlowFocus(webContentsId: number): TestFlowFocus | undefined {
  return flowFocus.get(webContentsId)
}

/** Without a saved place the pair opens side by side on the primary screen: the test flow left, the browser right. */
function defaultBounds(role: PairRole): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  const flowWidth = Math.min(760, Math.round(area.width * 0.4))
  return role === 'flow'
    ? { x: area.x, y: area.y, width: flowWidth, height: area.height }
    : { x: area.x + flowWidth, y: area.y, width: area.width - flowWidth, height: area.height }
}

function createWindow(feature: string, role: PairRole, title: string, webPreferences: Electron.WebPreferences): BrowserWindow {
  const offscreen = windowOffscreen(process.env)
  const key = pairPlaceKey(feature, role)
  const place = offscreen ? null : savedPlacement(key)
  const win = new BrowserWindow({
    show: false,
    ...(offscreen ? { ...OFFSCREEN_POSITION, skipTaskbar: true, width: 800, height: 900 } : (place?.bounds ?? defaultBounds(role))),
    title,
    backgroundColor: WINDOW_BACKGROUND,
    webPreferences
  })
  // The page's own title must not replace the one that names the feature.
  win.on('page-title-updated', (event) => event.preventDefault())
  win.webContents.on('before-input-event', (event, input) => {
    if (!isPairFlipKey(input)) return
    event.preventDefault()
    flipPair(feature, role)
  })
  win.on('closed', () => {
    const pair = pairs.get(feature)
    if (!pair) return
    if (pair[role] === win) pair[role] = null
    if (!pair.flow && !pair.preview) pairs.delete(feature)
  })
  if (!offscreen) {
    // Set again after creation: Windows can scale constructor bounds by the wrong monitor's DPI.
    if (place) win.setBounds(place.bounds)
    trackWindowPlace(win, key)
  }
  return win
}

function reveal(win: BrowserWindow, feature: string, role: PairRole): void {
  if (windowOffscreen(process.env)) {
    win.showInactive()
    return
  }
  revealPlaced(win, savedPlacement(pairPlaceKey(feature, role)))
}

function bringForward(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  if (windowOffscreen(process.env)) {
    win.showInactive()
    return
  }
  win.show()
  win.focus()
}

/** Focus moves to the other window of the same feature; with only one window open it stays. */
function flipPair(feature: string, from: PairRole): void {
  const target = pairs.get(feature)?.[from === 'flow' ? 'preview' : 'flow']
  if (alive(target)) bringForward(target)
}

/** Navigation, new windows and redirects follow the rule: the feature's own ports load, other http(s) addresses open in the default browser. */
function guardPreview(win: BrowserWindow, feature: string): void {
  /** Only the page itself may send the user to the default browser; an embedded frame is just blocked. */
  const judge = (url: string, mainFrame: boolean): boolean => {
    const verdict = previewNavigation(url, pairs.get(feature)?.ports ?? [])
    if (verdict === 'external' && mainFrame) void shell.openExternal(url)
    return verdict === 'allow'
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (judge(url, true)) void win.loadURL(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-frame-navigate', (event) => {
    if (!judge(event.url, event.isMainFrame)) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event) => {
    if (!judge(event.url, event.isMainFrame)) event.preventDefault()
  })
}

/** Sub-requests of the page follow the same rule, and the page may ask for no device permission. */
function guardPartition(feature: string): void {
  const partition = previewPartition(feature)
  if (guardedPartitions.has(partition)) return
  guardedPartitions.add(partition)
  const store = session.fromPartition(partition)
  store.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  store.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) =>
    callback({ cancel: !previewRequestAllowed(details.url, pairs.get(feature)?.ports ?? []) })
  )
}

function openFlow(spec: PairSpec, pair: Pair): void {
  if (alive(pair.flow)) {
    flowFocus.set(pair.flow.webContents.id, spec.flow)
    return
  }
  const win = createWindow(spec.feature, 'flow', `${spec.feature} · Test steps`, appWebPreferences())
  guardAppWindow(win)
  const id = win.webContents.id
  flowFocus.set(id, spec.flow)
  win.on('closed', () => flowFocus.delete(id))
  loadRenderer(win, { ...TEST_FLOW_WINDOW_QUERY, feature: spec.feature })
  pair.flow = win
  reveal(win, spec.feature, 'flow')
}

function openPreview(spec: PairSpec, url: string, pair: Pair): void {
  if (alive(pair.preview)) return
  guardPartition(spec.feature)
  const win = createWindow(spec.feature, 'preview', `${spec.feature} · Preview`, {
    partition: previewPartition(spec.feature),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false
  })
  pair.preview = win
  guardPreview(win, spec.feature)
  void win.loadURL(url)
  reveal(win, spec.feature, 'preview')
}

/** Opens the feature's test pair, or brings the open one to the front: a window the user closed is opened again, an open one never twice. */
export function openPair(spec: PairSpec): void {
  const pair = pairs.get(spec.feature) ?? { flow: null, preview: null, ports: [] }
  pairs.set(spec.feature, pair)
  pair.ports = spec.preview?.ports ?? []
  const hadFlow = alive(pair.flow)
  const hadPreview = alive(pair.preview)
  openFlow(spec, pair)
  if (spec.preview) openPreview(spec, spec.preview.url, pair)
  if (hadFlow && alive(pair.flow)) {
    pair.flow.webContents.send(IPC.TEST_FLOW_FOCUS, spec.flow)
    bringForward(pair.flow)
  }
  if (hadPreview && alive(pair.preview)) bringForward(pair.preview)
}

/** What Complete calls: closes the feature's windows and drops its browser store (cookies, storage, cache). */
export async function closeFeaturePair(feature: string): Promise<void> {
  const pair = pairs.get(feature)
  pairs.delete(feature)
  for (const win of [pair?.flow, pair?.preview]) if (alive(win)) win.destroy()
  const store = session.fromPartition(previewPartition(feature))
  await store.clearStorageData()
  await store.clearCache()
}
