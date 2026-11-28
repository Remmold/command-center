import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Model3dService } from './service'

/** The 3D view's channels: the jobs and server state, pushed on each change, Stop server, Cancel and Run anyway. */
export function registerModel3dIpc(service: Model3dService): void {
  ipcMain.handle(IPC.MODEL3D_VIEW, () => service.view())
  ipcMain.handle(IPC.MODEL3D_STOP_SERVER, () => service.stopServer())
  ipcMain.handle(IPC.MODEL3D_CANCEL, (_e, id: unknown) => (typeof id === 'string' ? service.cancel(id) : { ok: false, error: 'There is no such job.' }))
  ipcMain.handle(IPC.MODEL3D_RUN_ANYWAY, (_e, id: unknown) => (typeof id === 'string' ? service.runAnyway(id) : { ok: false, error: 'There is no such job.' }))
  service.onChanged((view) => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC.MODEL3D_CHANGED, view)
  })
}
