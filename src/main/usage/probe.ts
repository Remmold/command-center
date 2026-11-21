import { spawn } from 'node:child_process'
import { locateClaude } from '../pty/claude-locator'
import { childEnv } from '../util/childEnv'
import { ControlChannel, type ControlPayload } from '../claude/controlChannel'

const PROBE_TIMEOUT_MS = 30_000

export interface ProbeReplies {
  init: ControlPayload
  usage: ControlPayload
}

/** Starts a throwaway CLI that answers `initialize` and `get_usage`, then ends it; no prompt is ever sent. */
export function probeUsage(cwd: string, profileEnv: Record<string, string>): Promise<ProbeReplies> {
  const launch = locateClaude()
  const args = [
    ...launch.args,
    '--print',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--setting-sources',
    'user,project,local'
  ]
  const child = spawn(launch.command, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv(process.env, { ...profileEnv, ...launch.env }),
    shell: false,
    windowsHide: true
  })
  let alive = true
  const control = new ControlChannel({
    write: (line) => {
      if (alive) child.stdin?.write(line)
    }
  })
  let buf = ''
  let stderr = ''
  child.stdout?.setEncoding('utf-8')
  child.stdout?.on('data', (chunk: string) => {
    buf += chunk
    let idx: number
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        control.accept(JSON.parse(line))
      } catch {
        // not JSON: the CLI's own chatter
      }
    }
  })
  child.stderr?.setEncoding('utf-8')
  child.stderr?.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-2000)
  })
  child.stdin?.on('error', () => undefined)

  const end = (): void => {
    if (!alive) return
    alive = false
    try {
      child.stdin?.end()
    } catch {
      // already closed
    }
    child.kill()
  }

  const exited = new Promise<never>((_, reject) => {
    child.on('error', (err) => reject(err))
    child.on('exit', (code) => {
      alive = false
      control.close('claude exited')
      reject(new Error(stderr.trim().split(/\r?\n/).pop() || `claude exited with code ${code}`))
    })
  })
  exited.catch(() => undefined)

  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`usage check timed out after ${PROBE_TIMEOUT_MS / 1000} s`)), PROBE_TIMEOUT_MS)
  })

  const talk = (async (): Promise<ProbeReplies> => {
    const init = await control.request('initialize', { hooks: null })
    const usage = await control.request('get_usage')
    return { init, usage }
  })()

  return Promise.race([talk, exited, timeout]).finally(() => {
    clearTimeout(timer)
    end()
  })
}
