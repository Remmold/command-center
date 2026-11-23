import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { IPC } from '../../shared/ipc-channels'
import { claudeManager } from '../claude/manager'
import { approvalBroker } from '../claude/approvals'
import { userDataPath } from '../util/paths'
import { createUpdateController, type UpdateController, type UpdaterPort } from './controller'
import { AUTO_RESTART_IDLE_MS } from './restartPlan'
import { FakeUpdater, githubUpdater } from './updaters'
import { flushWindowPlace } from '../windowPlace/service'

const CHECK_EVERY_MS = 30 * 60_000
const MARKER = 'update-restart.json'
const SETTINGS = 'update-settings.json'

declare global {
  var __ccFakeUpdater: FakeUpdater | undefined
}

/** Dev runs and anything on the fake CLI (`CC_CLAUDE_BIN`) never reach GitHub. */
function pickUpdater(): { updater: UpdaterPort; idleMs: number } {
  if (app.isPackaged && !process.env.CC_CLAUDE_BIN) return { updater: githubUpdater(), idleMs: AUTO_RESTART_IDLE_MS }
  const fake = new FakeUpdater()
  globalThis.__ccFakeUpdater = fake
  const idle = Number(process.env.CC_UPDATE_IDLE_MS)
  return { updater: fake, idleMs: Number.isFinite(idle) && idle > 0 ? idle : AUTO_RESTART_IDLE_MS }
}

/** Reads and removes the marker a restart to update leaves behind. */
function consumeMarker(): boolean {
  const file = userDataPath(MARKER)
  if (!existsSync(file)) return false
  rmSync(file, { force: true })
  return true
}

/** Off unless turned on in Settings → General. */
function savedAutoRestart(): boolean {
  try {
    return (JSON.parse(readFileSync(userDataPath(SETTINGS), 'utf-8')) as { autoRestart?: unknown } | null)?.autoRestart === true
  } catch {
    return false
  }
}

export function startUpdates(): UpdateController {
  const { updater, idleMs } = pickUpdater()
  const controller = createUpdateController({
    updater,
    idleMs,
    checkEveryMs: CHECK_EVERY_MS,
    version: app.getVersion(),
    afterUpdate: consumeMarker(),
    autoRestart: savedAutoRestart(),
    clock: {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
      setInterval: (fn, ms) => setInterval(fn, ms)
    },
    beforeRestart: () => {
      flushWindowPlace()
      writeFileSync(userDataPath(MARKER), JSON.stringify({ at: Date.now() }))
    }
  })

  claudeManager.onSpawn((paneId) => controller.feed({ kind: 'spawned', paneId }))
  claudeManager.onSend((paneId, uuid) => controller.feed({ kind: 'sent', paneId, uuid }))
  claudeManager.onEvent((paneId, event) => controller.feed({ kind: 'claude-event', paneId, event }))
  claudeManager.onExit((paneId) => controller.feed({ kind: 'exit', paneId }))
  approvalBroker.onRaised((r) => controller.feed({ kind: 'approval-raised', paneId: r.paneId, requestId: r.requestId }))
  approvalBroker.onSettled((s) => controller.feed({ kind: 'approval-resolved', paneId: s.paneId, requestId: s.requestId }))

  controller.onChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.UPDATE_CHANGED, status)
    }
  })
  ipcMain.handle(IPC.UPDATE_STATUS, () => controller.status())
  ipcMain.handle(IPC.UPDATE_CHECK, () => controller.check())
  ipcMain.handle(IPC.UPDATE_RESTART, (_e, force: boolean) => controller.restart(force === true))
  ipcMain.handle(IPC.UPDATE_SET_AUTO_RESTART, (_e, on: boolean) => {
    writeFileSync(userDataPath(SETTINGS), JSON.stringify({ autoRestart: on === true }))
    controller.setAutoRestart(on === true)
  })

  controller.start()
  return controller
}
