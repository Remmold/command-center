import { app, dialog } from 'electron'
import { registerIpc } from './ipc'
import { removeLegacyHook } from './permission/legacyHook'
import { sessionStatusTracker } from './sessions/tracker'
import * as workspaces from './workspaces/store'
import { startAttention } from './attention/service'
import { createRepoIdentityService } from './repoIdentity/service'
import { startsHidden } from './tray/autostart'
import { createStartWithWindowsControl } from './tray/startWithWindows'
import { createAppTray } from './tray/tray'
import { startUpdates } from './update/service'
import type { StartWithWindowsState } from '../shared/types'
import { iconPath } from './util/paths'
import {
  allowWindowClose,
  createMainWindow,
  getMainWindow,
  onscreen,
  showMainWindow,
  showSession,
  showView
} from './window'

/** Keep equal to the electron-builder appId, or packaged notifications lose their attribution. */
const APP_USER_MODEL_ID = 'com.commandcenter.app'

let confirmingQuit = false

async function confirmAndQuit(): Promise<void> {
  if (confirmingQuit) return
  confirmingQuit = true
  try {
    if (await quitConfirmed()) app.quit()
  } finally {
    confirmingQuit = false
  }
}

async function quitConfirmed(): Promise<boolean> {
  const running = sessionStatusTracker.list().filter((e) => e.status === 'running').length
  if (running > 0) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Quit Command Center',
      message: running === 1 ? '1 session is running.' : `${running} sessions are running.`,
      detail: 'Quitting stops them mid-turn.',
      buttons: ['Quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    return response === 0
  }
  return true
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
  app.on('window-all-closed', () => {
    // Stays alive in the tray.
  })

  app.whenReady().then(async () => {
    void workspaces
      .list()
      .then((all) => Promise.all(all.map((w) => removeLegacyHook(w.path).then((changed) => changed && console.log('[permission] removed legacy hook from', w.path)))))
      .catch((err) => console.error('[permission] legacy hook cleanup failed', err))
    const repoIdentities = createRepoIdentityService(app.getPath('userData'), iconPath('icon.png'), workspaces.list)
    const startWithWindows = createStartWithWindowsControl()
    registerIpc({ repoIdentities, startWithWindows })
    startUpdates()
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
      notificationIcon: repoIdentities.notificationIcon
    })

    app.on('will-quit', () => {
      stopAttention()
      tray.destroy()
    })
  })
}
