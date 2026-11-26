import { app, BrowserWindow, dialog, protocol, session } from 'electron'
import { registerIpc, terminals } from './ipc'
import { terminalQuitQuestion, type QuitKind } from './quitConfirm'
import { routeMenuQuit } from './menuQuit'
import { removeLegacyHook } from './permission/legacyHook'
import { sessionStatusTracker } from './sessions/tracker'
import * as workspaces from './workspaces/store'
import { startAttention } from './attention/service'
import { createIconImages } from './repoIdentity/iconImages'
import { createRepoIdentityService } from './repoIdentity/service'
import { IPC } from '../shared/ipc-channels'
import { startsHidden } from './tray/autostart'
import { createStartWithWindowsControl } from './tray/startWithWindows'
import { createAppTray } from './tray/tray'
import { startUpdates } from './update/service'
import type { StartWithWindowsState } from '../shared/types'
import { iconPath } from './util/paths'
import { routeMenuZoom } from './zoom/menu'
import { handleMediaScheme, MEDIA_SCHEME_PRIVILEGES } from './files/media'
import { handleTestFlowScheme, TEST_FLOW_SCHEME_PRIVILEGES } from './testFlow/scheme'
import {
  allowWindowClose,
  createMainWindow,
  getMainWindow,
  onscreen,
  showMainWindow,
  showApprovals,
  showSession,
  showView
} from './window'

// Electron keeps only the last call's list, so every scheme goes in this one.
protocol.registerSchemesAsPrivileged([MEDIA_SCHEME_PRIVILEGES, TEST_FLOW_SCHEME_PRIVILEGES])

/** Keep equal to the electron-builder appId, or packaged notifications lose their attribution. */
const APP_USER_MODEL_ID = 'com.commandcenter.app'

/** Lets the window draw first; the repo icon search then runs in the background. */
const ICON_SEARCH_DELAY_MS = 3000

let confirmingQuit = false

async function confirmAndQuit(): Promise<void> {
  if (await confirmQuit('quit')) app.quit()
}

/** One question at a time; a quit asked for while one is showing is dropped. */
async function confirmQuit(kind: QuitKind): Promise<boolean> {
  if (confirmingQuit) return false
  confirmingQuit = true
  try {
    // The update restart asks about busy sessions itself, in the update pill.
    if (kind === 'quit' && !(await sessionsQuitConfirmed())) return false
    return await terminalsQuitConfirmed(kind)
  } finally {
    confirmingQuit = false
  }
}

async function sessionsQuitConfirmed(): Promise<boolean> {
  const running = sessionStatusTracker.list().filter((e) => e.status === 'running').length
  if (running === 0) return true
  return askQuit(running === 1 ? '1 session is running.' : `${running} sessions are running.`, 'Quitting stops them mid-turn.')
}

function terminalsQuitConfirmed(kind: QuitKind): Promise<boolean> {
  const question = terminalQuitQuestion(terminals.runningCount(), kind)
  return question === null ? Promise.resolve(true) : askQuit(question, 'Quitting ends them.')
}

async function askQuit(message: string, detail: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Quit Command Center',
    message,
    detail,
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })
  return response === 0
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Unpackaged builds have no Start-menu shortcut carrying the appId, and Windows drops toasts from unknown ids.
  app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath)

  app.on('second-instance', () => {
    if (app.isReady()) showMainWindow()
  })
  app.on('before-quit', allowWindowClose)
  // Chromium writes local storage lazily; a quit or update restart right after a change (a hidden list, a draft) would lose it.
  app.on('before-quit', () => session.defaultSession.flushStorageData())
  app.on('window-all-closed', () => {
    // Stays alive in the tray.
  })

  app.whenReady().then(async () => {
    void workspaces
      .list()
      .then((all) => Promise.all(all.map((w) => removeLegacyHook(w.path).then((changed) => changed && console.log('[permission] removed legacy hook from', w.path)))))
      .catch((err) => console.error('[permission] legacy hook cleanup failed', err))
    const repoIdentities = createRepoIdentityService({
      dataDir: app.getPath('userData'),
      appIcon: iconPath('icon.png'),
      listWorkspaces: workspaces.list,
      images: createIconImages(),
      onChanged: (views) => {
        for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC.REPO_IDENTITIES_CHANGED, views)
      }
    })
    setTimeout(() => void repoIdentities.detectMissing(), ICON_SEARCH_DELAY_MS)
    const startWithWindows = createStartWithWindowsControl()
    registerIpc({ repoIdentities, startWithWindows })
    handleMediaScheme()
    handleTestFlowScheme()
    startUpdates({ confirmRestart: () => confirmQuit('update-restart') })
    routeMenuZoom()
    routeMenuQuit(() => void confirmAndQuit())
    const win = createMainWindow({ show: !startsHidden(process.argv) })

    const tray = createAppTray({
      open: () => showMainWindow(),
      showView,
      quit: () => void confirmAndQuit(),
      getWindow: getMainWindow
    })
    win.on('show', tray.refreshOverlay)
    const showStartWithWindows = (state: StartWithWindowsState): void =>
      tray.setStartWithWindows({ ...state, onToggle: startWithWindows.set })
    showStartWithWindows(startWithWindows.get())
    startWithWindows.onChanged(showStartWithWindows)

    const stopAttention = startAttention({
      tracker: sessionStatusTracker,
      listWorkspaces: workspaces.list,
      onscreen,
      setBadge: tray.setBadge,
      openSession: showSession,
      openApprovals: showApprovals,
      notificationIcon: repoIdentities.notificationIcon
    })

    app.on('will-quit', () => {
      stopAttention()
      tray.destroy()
    })
  })
}
