import { spawn } from 'node:child_process'

const TAIL_BYTES = 1500

/** A shell command's children outlive a plain kill on Windows, so the whole tree goes. */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
  else process.kill(pid)
}

/** Runs a workspace's install command in a new worktree; rejects with the command's own last output when it fails. */
export function runInstall(cwd: string, command: string, timeoutMs = 10 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    // Electron's own flag would make a node-based installer run as Electron.
    const { ELECTRON_RUN_AS_NODE: _drop, ...env } = process.env
    const child = spawn(command, { cwd, shell: true, windowsHide: true, env })
    let tail = ''
    const keep = (chunk: Buffer): void => {
      tail = (tail + chunk.toString()).slice(-TAIL_BYTES)
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    const timer = setTimeout(() => {
      killTree(child.pid)
      reject(new Error(`The install command "${command}" took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped.`))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`The install command "${command}" could not start: ${err.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`The install command "${command}" failed (exit ${code}).${tail.trim() ? ` ${tail.trim()}` : ''}`))
    })
  })
}
