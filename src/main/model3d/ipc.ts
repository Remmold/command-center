import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { resolveMedia } from '../files/media'
import { openModel } from './modelFile'
import { NO_SUCH_JOB, type Model3dService } from './service'

/** The 3D view's channels: the jobs and server state, pushed on each change, Stop server, Cancel, Run anyway, and opening a model. */
export function registerModel3dIpc(service: Model3dService): void {
  ipcMain.handle(IPC.MODEL3D_VIEW, () => service.view())
  ipcMain.handle(IPC.MODEL3D_STOP_SERVER, () => service.stopServer())
  ipcMain.handle(IPC.MODEL3D_CANCEL, (_e, id: unknown) => (typeof id === 'string' ? service.cancel(id) : { ok: false, error: NO_SUCH_JOB }))
  ipcMain.handle(IPC.MODEL3D_RUN_ANYWAY, (_e, id: unknown) => (typeof id === 'string' ? service.runAnyway(id) : { ok: false, error: NO_SUCH_JOB }))
  ipcMain.handle(IPC.MODEL3D_OPEN_MODEL, (_e, path: unknown) =>
    typeof path === 'string' ? openModel(path, resolveMedia) : { ok: false, error: 'No model path given' }
  )
  ipcMain.handle(IPC.MODEL3D_PICK_MODEL, async (event) => {
    const options: Electron.OpenDialogOptions = { title: 'Open model', properties: ['openFile'], filters: [{ name: 'GLB model', extensions: ['glb'] }] }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return openModel(result.filePaths[0], resolveMedia)
  })
  service.onChanged((view) => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC.MODEL3D_CHANGED, view)
  })
}
