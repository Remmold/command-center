import { spawn } from 'node:child_process'
import { locateInstalledClaude, where } from '../pty/claude-locator'

export interface Ripgrep {
  command: string
  args: string[]
  argv0?: string
}

let ripgrep: Ripgrep | null | undefined

/** `rg` on PATH, else the ripgrep built into the native `claude` binary (run as `argv0: rg`, as the CLI does). */
export function locateRipgrep(): Ripgrep | null {
  if (ripgrep !== undefined) return ripgrep
  const exe = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const onPath = where('rg').find((p) => p.toLowerCase().endsWith(exe))
  if (onPath) return (ripgrep = { command: onPath, args: [] })
  try {
    const claude = locateInstalledClaude()
    const native = claude.args.length === 0 && /[\\/]claude(\.exe)?$/i.test(claude.command)
    ripgrep = native ? { command: claude.command, args: ['--no-config'], argv0: 'rg' } : null
  } catch {
    ripgrep = null
  }
  return ripgrep
}

function lines(out: string): string[] {
  return out.trim().split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean)
}

export interface RipgrepLimits {
  timeoutMs: number
  maxBuffer: number
}

/**
 * Settles like the extension's `Pur`: exit 1 is an empty list, a timeout or a full buffer keeps the complete lines.
 * `spawn`, not `execFile`: Electron's `execFile` drops `argv0`, which the embedded ripgrep needs.
 */
export function runRipgrep(rg: Ripgrep, cwd: string, args: string[], { timeoutMs, maxBuffer }: RipgrepLimits): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(rg.command, [...rg.args, ...args], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(rg.argv0 ? { argv0: rg.argv0 } : {})
    })
    let out = ''
    let cut = false
    const stop = () => {
      cut = true
      child.kill()
    }
    const timer = setTimeout(stop, timeoutMs)
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      out += chunk
      if (out.length > maxBuffer) stop()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (cut) return out.trim() ? resolve(lines(out).slice(0, -1)) : reject(new Error('ripgrep timed out'))
      if (code === 0 || (code === 2 && out.trim())) return resolve(lines(out))
      if (code === 1) return resolve([])
      reject(new Error(`ripgrep exited with ${code}`))
    })
  })
}
