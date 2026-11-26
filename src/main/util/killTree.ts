import { spawn } from 'node:child_process'

/** A shell command's children outlive a plain kill on Windows, so the whole tree goes. */
export function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => undefined)
  else process.kill(pid)
}
