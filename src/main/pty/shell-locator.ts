import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export type ShellKind = 'pwsh' | 'powershell' | 'cmd' | 'bash'

export interface ShellLaunch {
  command: string
  args: string[]
}

export class ShellNotFoundError extends Error {
  constructor(shell: string) {
    super(`Could not find shell '${shell}' on PATH.`)
    this.name = 'ShellNotFoundError'
  }
}

function where(name: string): string[] {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(cmd, [name], { encoding: 'utf-8', shell: false })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function preferExe(hits: string[]): string | undefined {
  return hits.find((p) => p.toLowerCase().endsWith('.exe')) ?? hits[0]
}

/**
 * Escape a path for PowerShell single-quoted string:
 *   ' → ''
 */
function psEscape(path: string): string {
  return path.replace(/'/g, "''")
}

/**
 * Returns the command + args to launch the given shell, forcing the initial
 * working directory to `cwd`. Shell profiles love to call Set-Location, so
 * we use explicit per-shell flags instead of relying on node-pty's spawn cwd.
 */
export function locateShell(kind: ShellKind, cwd?: string): ShellLaunch {
  if (process.platform === 'win32') {
    if (kind === 'pwsh') {
      const pwsh = preferExe(where('pwsh'))
      if (pwsh && existsSync(pwsh)) {
        const args = ['-NoLogo']
        if (cwd) args.push('-WorkingDirectory', cwd)
        return { command: pwsh, args }
      }
      // Fall back to Windows PowerShell.
      const ps = preferExe(where('powershell'))
      if (ps && existsSync(ps)) {
        const args = ['-NoLogo', '-NoExit']
        if (cwd) args.push('-Command', `Set-Location -LiteralPath '${psEscape(cwd)}'`)
        return { command: ps, args }
      }
      throw new ShellNotFoundError('pwsh')
    }
    if (kind === 'powershell') {
      const ps = preferExe(where('powershell'))
      if (ps && existsSync(ps)) {
        const args = ['-NoLogo', '-NoExit']
        if (cwd) args.push('-Command', `Set-Location -LiteralPath '${psEscape(cwd)}'`)
        return { command: ps, args }
      }
      throw new ShellNotFoundError('powershell')
    }
    if (kind === 'cmd') {
      const cmdExe = process.env.COMSPEC ?? 'cmd.exe'
      if (cwd) {
        // /K keeps cmd open; we then `cd /D "<cwd>"` before the prompt.
        return { command: cmdExe, args: ['/K', `cd /D "${cwd}"`] }
      }
      return { command: cmdExe, args: [] }
    }
    if (kind === 'bash') {
      const bash = preferExe(where('bash'))
      if (bash && existsSync(bash)) {
        // git-bash on Windows: cd before interactive prompt.
        const args = ['--login', '-i']
        if (cwd) {
          // Use -c to pre-cd, then exec bash itself interactively.
          const safe = cwd.replace(/'/g, `'\\''`)
          return {
            command: bash,
            args: ['--login', '-i', '-c', `cd '${safe}' && exec bash -i`]
          }
        }
        return { command: bash, args }
      }
      throw new ShellNotFoundError('bash')
    }
  } else {
    if (kind === 'bash' || kind === 'cmd') {
      const shell = process.env.SHELL ?? '/bin/bash'
      if (cwd) {
        const safe = cwd.replace(/'/g, `'\\''`)
        return { command: shell, args: ['-c', `cd '${safe}' && exec '${shell}'`] }
      }
      return { command: shell, args: [] }
    }
    const hit = preferExe(where(kind))
    if (hit && existsSync(hit)) return { command: hit, args: [] }
  }
  throw new ShellNotFoundError(kind)
}
