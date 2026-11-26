import { spawn } from 'node:child_process'
import { childEnv } from '../util/childEnv'
import { killTree } from '../util/killTree'

const TAIL_CHARS = 1500

/** Runs a workspace's install command in a new worktree; rejects with the command's own last output when it fails. */
export function runInstall(cwd: string, command: string, timeoutMs = 10 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, env: childEnv(process.env) })
    let tail = ''
    const keep = (chunk: Buffer): void => {
      tail = (tail + chunk.toString()).slice(-TAIL_CHARS)
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
