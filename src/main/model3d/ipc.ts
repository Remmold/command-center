import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Model3dService } from './service'

/** The 3D view's channels: the jobs and server state, pushed on each change, and Stop server. */
export function registerModel3dIpc(service: Model3dService): void {
  ipcMain.handle(IPC.MODEL3D_VIEW, () => service.view())
  ipcMain.handle(IPC.MODEL3D_STOP_SERVER, () => service.stopServer())
  service.onChanged((view) => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC.MODEL3D_CHANGED, view)
  })
}
