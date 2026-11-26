import { ipcMain, webContents, type WebContents } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { TestFlowView } from '../../shared/testFlow'
import { getMainWindow } from '../window'
import { openTestFlowWindow, publishTestFlowFocus, testFlowFocus } from './popOut'
import { readTestFlow, stampOf } from './reader'
import { markStepOnDisk, readSteps } from './steps'
import { resultsPathFor, type Mark, type StepsView } from '../../shared/testSteps'
import { readTestFlowsFolder, writeTestFlowsFolder } from './settings'
import { TestFlowWatches } from './watch'

const MAX_WATCHER_LENGTH = 100
const MAX_CANDIDATES = 64
const MAX_PATH_LENGTH = 1024
const MAX_HASH_LENGTH = 32
const MAX_NOTE_LENGTH = 300

const isWatcher = (watcher: unknown): watcher is string => typeof watcher === 'string' && watcher.length > 0 && watcher.length <= MAX_WATCHER_LENGTH

function candidates(paths: unknown): string[] {
  if (!Array.isArray(paths)) return []
  return paths.filter((p): p is string => typeof p === 'string' && p.length <= MAX_PATH_LENGTH).slice(0, MAX_CANDIDATES)
}

/** The Test tab's reads and watches; each window's watchers are told when a file they show changes. */
export function registerTestFlowIpc(): () => void {
  const watches = new TestFlowWatches((key) => {
    const cut = key.indexOf('\n')
    const contents = webContents.fromId(Number(key.slice(0, cut)))
    if (contents && !contents.isDestroyed()) contents.send(IPC.TEST_FLOW_CHANGED, key.slice(cut + 1))
  })
  // A read that resolves after a newer read or a release must not set its watches.
  const turns = new Map<string, number>()
  let lastTurn = 0
  const hooked = new Set<number>()
  const nextTurn = (key: string): number => {
    turns.set(key, ++lastTurn)
    return lastTurn
  }
  const forget = (key: string): void => {
    turns.delete(key)
    watches.release(key)
  }
  const keyOf = (sender: WebContents, watcher: string): string => {
    if (!hooked.has(sender.id)) {
      hooked.add(sender.id)
      const id = sender.id
      sender.once('destroyed', () => {
        hooked.delete(id)
        for (const key of [...turns.keys()]) {
          if (!key.startsWith(`${id}\n`)) continue
          watches.release(key)
          turns.delete(key)
        }
      })
    }
    return `${sender.id}\n${watcher}`
  }

  ipcMain.handle(IPC.TEST_FLOW_SHOW, async (event, watcher: unknown, paths: unknown): Promise<TestFlowView> => {
    if (!isWatcher(watcher)) return { found: false }
    const key = keyOf(event.sender, watcher)
    const turn = nextTurn(key)
    const read = await readTestFlow(await readTestFlowsFolder(), candidates(paths))
    if (turns.get(key) === turn && !event.sender.isDestroyed()) watches.set(key, read.watch)
    return read.view
  })
  ipcMain.handle(IPC.TEST_STEPS_SHOW, async (event, watcher: unknown, path: unknown): Promise<StepsView> => {
    if (!isWatcher(watcher) || typeof path !== 'string' || path.length > MAX_PATH_LENGTH) return { found: false }
    const key = keyOf(event.sender, watcher)
    const turn = nextTurn(key)
    const folder = await readTestFlowsFolder()
    // Stamped before reading, so a write during the read still counts as a change.
    const watch = [path, resultsPathFor(path)]
    const stamped = await Promise.all(watch.map(async (p) => ({ path: p, stamp: await stampOf(p) })))
    const view = await readSteps(folder, path)
    if (turns.get(key) === turn && !event.sender.isDestroyed()) watches.set(key, view.found ? stamped : stamped.slice(0, 1))
    return view
  })
  ipcMain.handle(IPC.TEST_STEPS_MARK, async (_e, path: unknown, hash: unknown, mark: unknown, note: unknown): Promise<StepsView> => {
    const valid = typeof path === 'string' && path.length <= MAX_PATH_LENGTH && typeof hash === 'string' && hash.length <= MAX_HASH_LENGTH
    if (!valid || (mark !== null && mark !== 'pass' && mark !== 'fail')) return { found: false }
    const text = typeof note === 'string' ? note.slice(0, MAX_NOTE_LENGTH) : ''
    return markStepOnDisk(await readTestFlowsFolder(), path, hash, mark as Mark | null, text)
  })
  ipcMain.handle(IPC.TEST_FLOW_RELEASE, (event, watcher: unknown) => {
    if (isWatcher(watcher)) forget(keyOf(event.sender, watcher))
  })
  ipcMain.handle(IPC.TEST_FLOW_FOLDER_GET, () => readTestFlowsFolder())
  ipcMain.handle(IPC.TEST_FLOW_FOLDER_SET, (_e, folder: string) => writeTestFlowsFolder(folder))
  ipcMain.handle(IPC.TEST_FLOW_POP_OUT, () => openTestFlowWindow())
  ipcMain.on(IPC.TEST_FLOW_PUBLISH, (event, focus: unknown) => {
    if (event.sender === getMainWindow()?.webContents) publishTestFlowFocus(focus)
  })
  ipcMain.handle(IPC.TEST_FLOW_FOCUS_GET, () => testFlowFocus())
  return () => watches.dispose()
}
