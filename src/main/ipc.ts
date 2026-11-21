import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { IPC } from '../shared/ipc-channels'
import * as projects from './projects/store'
import * as apps from './apps/store'
import { appManager } from './apps/manager'
import { ptyManager } from './pty/manager'
import { claudeManager } from './claude/manager'
import { listProjectFiles } from './files/lister'
import { saveAsDialog } from './files/save'
import { readProjectFile, writeProjectFile } from './files/io'
import { listLocalSessions } from './claude/local-sessions'
import { getDiff, getStatus, getUntrackedFilePreview } from './git/service'
import {
  permissionServer,
  type PermissionRequest,
  type PermissionResponse
} from './permission/server'

let unsubscribers: Array<() => void> = []

export function registerIpc(): void {
  // Projects
  ipcMain.handle(IPC.PROJECTS_LIST, () => projects.list())

  ipcMain.handle(IPC.PROJECTS_ADD, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return projects.add(result.filePaths[0])
  })

  ipcMain.handle(IPC.PROJECTS_REMOVE, (_event, id: string) => projects.remove(id))

  ipcMain.handle(IPC.FILES_LIST, (_event, cwd: string) => listProjectFiles(cwd))

  // Managed apps (machine-wide launchers/servers — independent of any project)
  ipcMain.handle(IPC.APPS_LIST, () => apps.list())
  ipcMain.handle(IPC.APPS_ADD, (_e, app: Parameters<typeof apps.add>[0]) => apps.add(app))
  ipcMain.handle(IPC.APPS_REMOVE, (_e, id: string) => apps.remove(id))
  ipcMain.handle(IPC.APPS_START, async (_e, id: string, update?: boolean) => {
    const app = (await apps.list()).find((a) => a.id === id)
    if (!app) return { ok: false, error: 'unknown app' }
    return appManager.start(app, Boolean(update))
  })
  ipcMain.handle(IPC.APPS_STOP, async (_e, id: string) => {
    const app = (await apps.list()).find((a) => a.id === id)
    if (!app) return { ok: false, error: 'unknown app' }
    return appManager.stop(app)
  })
  ipcMain.handle(IPC.APPS_STATUS, async () => appManager.status(await apps.list()))

  unsubscribers.push(
    appManager.onOutput((id, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.APPS_OUTPUT, { id, data })
      }
    })
  )
  unsubscribers.push(
    appManager.onExit((id, exitCode) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.APPS_EXIT, { id, exitCode })
      }
    })
  )

  // PTY (shells only — claude no longer goes through here)
  ipcMain.handle(
    IPC.PTY_SPAWN,
    (_e, paneId: string, kind: Parameters<typeof ptyManager.spawn>[1], cwd: string) =>
      ptyManager.spawn(paneId, kind, cwd)
  )
  ipcMain.on(IPC.PTY_WRITE, (_e, paneId: string, data: string) =>
    ptyManager.write(paneId, data)
  )
  ipcMain.on(IPC.PTY_RESIZE, (_e, paneId: string, cols: number, rows: number) =>
    ptyManager.resize(paneId, cols, rows)
  )
  ipcMain.on(IPC.PTY_KILL, (_e, paneId: string) => ptyManager.kill(paneId))

  unsubscribers.push(
    ptyManager.onData((paneId, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.PTY_DATA, { paneId, data })
      }
    })
  )
  unsubscribers.push(
    ptyManager.onExit((paneId, exitCode, signal) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed())
          win.webContents.send(IPC.PTY_EXIT, {
            paneId,
            exitCode,
            signal: signal ?? null
          })
      }
    })
  )

  // Claude (stream-json subprocess)
  ipcMain.handle(
    IPC.CLAUDE_START,
    (
      _e,
      paneId: string,
      cwd: string,
      model?: string,
      resumeSessionId?: string,
      permissionMode?: string
    ) => claudeManager.start(paneId, cwd, model, resumeSessionId, permissionMode)
  )
  ipcMain.on(
    IPC.CLAUDE_SEND,
    (
      _e,
      paneId: string,
      text: string,
      images?: Array<{ media_type: string; data: string }>
    ) => claudeManager.send(paneId, text, images)
  )

  ipcMain.handle(IPC.CLAUDE_LIST_LOCAL_SESSIONS, (_e, cwd: string) => listLocalSessions(cwd))

  ipcMain.handle(IPC.FILES_SAVE_AS, async (event, suggestedName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return saveAsDialog(win, suggestedName, content)
  })

  ipcMain.handle(IPC.FILES_READ, (_e, cwd: string, relativePath: string) =>
    readProjectFile(cwd, relativePath)
  )
  ipcMain.handle(IPC.FILES_WRITE, (_e, cwd: string, relativePath: string, content: string) =>
    writeProjectFile(cwd, relativePath, content)
  )

  ipcMain.handle(IPC.GIT_STATUS, (_e, cwd: string) => getStatus(cwd))
  ipcMain.handle(
    IPC.GIT_DIFF,
    (_e, cwd: string, path: string, staged: boolean, untracked?: boolean) =>
      untracked ? getUntrackedFilePreview(cwd, path) : getDiff(cwd, path, staged)
  )
  ipcMain.on(IPC.CLAUDE_INTERRUPT, (_e, paneId: string) => claudeManager.interrupt(paneId))
  ipcMain.on(IPC.CLAUDE_STOP, (_e, paneId: string) => claudeManager.stop(paneId))

  unsubscribers.push(
    claudeManager.onEvent((paneId, event) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.CLAUDE_EVENT, { paneId, event })
      }
    })
  )
  unsubscribers.push(
    claudeManager.onExit((paneId, exitCode) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.CLAUDE_EXIT, { paneId, exitCode })
      }
    })
  )

  const onPermissionRequest = (req: PermissionRequest) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.PERMISSION_REQUEST, req)
    }
  }
  permissionServer.on('request', onPermissionRequest)

  ipcMain.on(
    IPC.PERMISSION_RESPOND,
    (
      _e,
      requestId: string,
      response: PermissionResponse,
      allowForSession?: boolean
    ) => {
      permissionServer.respond(requestId, response, { allowForSession })
    }
  )

  app.on('before-quit', () => {
    ptyManager.killAll()
    claudeManager.stopAll()
    permissionServer.off('request', onPermissionRequest)
    void permissionServer.stop()
    for (const u of unsubscribers) u()
    unsubscribers = []
  })
}
