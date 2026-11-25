import { ipcMain, webContents, type WebContents } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import { readFindingsRun, type DriftChecksView, type SkeletonResult } from '../../shared/findings'
import { workspaceScope } from '../context/service'
import { TestFlowWatches } from '../testFlow/watch'
import { driftChecksFolder } from '../util/paths'
import { DriftChecksReader } from './reader'

const NOTHING: DriftChecksView = { runs: [] }

const RUN_ID = /^[A-Za-z0-9_-]{1,80}$/

/** A skeleton is a valid run with no steps or findings, named so its file stays inside the folder. */
async function writeSkeleton(folder: string, skeleton: unknown): Promise<SkeletonResult> {
  const { run, writing, note } = readFindingsRun(JSON.stringify(skeleton ?? null), null)
  if (!run || writing || note) return { ok: false, error: note ?? 'not a valid run' }
  if (!RUN_ID.test(run.runId)) return { ok: false, error: `run id ${run.runId} is not a plain name` }
  if (run.steps.length > 0 || run.findings.length > 0 || run.done) return { ok: false, error: 'a skeleton has no steps or findings and is not done' }
  const file = join(folder, `${run.runId}.json`)
  try {
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(file, JSON.stringify(run, null, 2), { flag: 'wx' })
    return { ok: true, file }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

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
  ipcMain.handle(IPC.DRIFT_CHECKS_BEGIN, (_event, skeleton: unknown): Promise<SkeletonResult> => writeSkeleton(driftChecksFolder(), skeleton))
  ipcMain.handle(IPC.DRIFT_CHECKS_RELEASE, (event) => {
    const key = keyOf(event.sender)
    turns.set(key, ++lastTurn)
    watches.release(key)
  })
  return () => watches.dispose()
}
