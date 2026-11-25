import { ipcMain, webContents, type WebContents } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { DriftChecksView } from '../../shared/findings'
import { workspaceScope } from '../context/service'
import { TestFlowWatches } from '../testFlow/watch'
import { driftChecksFolder } from '../util/paths'
import { DriftChecksReader } from './reader'

const NOTHING: DriftChecksView = { runs: [] }

/** The map's drift checks; while a window's map shows a run that is not done, main watches that file and tells the window. */
export function registerDriftChecksIpc(): () => void {
  const reader = new DriftChecksReader()
  const watches = new TestFlowWatches((key) => {
    const contents = webContents.fromId(Number(key))
    if (contents && !contents.isDestroyed()) contents.send(IPC.DRIFT_CHECKS_CHANGED)
  })
  // A read that resolves after a newer read or a release must not set its watches.
  const turns = new Map<string, number>()
  let lastTurn = 0
  const keyOf = (sender: WebContents): string => {
    const key = String(sender.id)
    if (!turns.has(key)) {
      sender.once('destroyed', () => {
        turns.delete(key)
        watches.release(key)
      })
    }
    return key
  }

  ipcMain.handle(IPC.DRIFT_CHECKS_SHOW, async (event, workspaceId: unknown): Promise<DriftChecksView> => {
    const key = keyOf(event.sender)
    const turn = ++lastTurn
    turns.set(key, turn)
    const scope = typeof workspaceId === 'string' ? await workspaceScope(workspaceId) : null
    const read = scope ? await reader.read(driftChecksFolder(), scope.workspacePath, scope.accountFolder) : { view: NOTHING, watch: [] }
    if (turns.get(key) === turn && !event.sender.isDestroyed()) watches.set(key, read.watch)
    return read.view
  })
  ipcMain.handle(IPC.DRIFT_CHECKS_RELEASE, (event) => {
    const key = keyOf(event.sender)
    turns.set(key, ++lastTurn)
    watches.release(key)
  })
  return () => watches.dispose()
}
