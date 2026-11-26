import { spawn as spawnChild } from 'node:child_process'
import * as pty from 'node-pty'
import { PtyManager } from './manager'
import { locateShell } from './shell-locator'

/** A stuck taskkill must not keep a terminal from closing. */
const KILL_TREE_LIMIT_MS = 2000

function killTree(pid: number): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, KILL_TREE_LIMIT_MS)
    const done = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const taskkill = spawnChild('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    taskkill.on('exit', done)
    taskkill.on('error', done)
  })
}

/** The app's pty manager on node-pty and the real shells. */
export function createPtyManager(): PtyManager {
  return new PtyManager({
    spawn: (file, args, options) =>
      pty.spawn(file, args, {
        name: 'xterm-256color',
        ...options,
        useConpty: true,
        useConptyDll: true
      } as Parameters<typeof pty.spawn>[2]),
    locate: locateShell,
    killTree
  })
}
