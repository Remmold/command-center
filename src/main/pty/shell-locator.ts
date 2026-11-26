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

function found(name: string): string | undefined {
  const hit = preferExe(where(name))
  return hit && existsSync(hit) ? hit : undefined
}

/** Escape a path for a PowerShell single-quoted string: ' → '' */
function psEscape(path: string): string {
  return path.replace(/'/g, "''")
}

function shSingleQuote(text: string): string {
  return `'${text.replace(/'/g, `'\''`)}'`
}

/**
 * The Windows arguments for `kind`, starting in `cwd`. Shell profiles love to call
 * Set-Location, so each shell gets explicit flags rather than relying on the spawn cwd.
 * With a `command` the shell runs it through its run-a-command form and exits after it.
 */
export function shellArgs(kind: ShellKind, cwd?: string, command?: string): string[] {
  if (kind === 'pwsh') {
    const args = ['-NoLogo']
    if (cwd) args.push('-WorkingDirectory', cwd)
    if (command) args.push('-Command', command)
    return args
  }
  if (kind === 'powershell') {
    const enter = cwd ? `Set-Location -LiteralPath '${psEscape(cwd)}'` : ''
    if (command) return ['-NoLogo', '-Command', enter ? `${enter}; ${command}` : command]
    return enter ? ['-NoLogo', '-NoExit', '-Command', enter] : ['-NoLogo', '-NoExit']
  }
  if (kind === 'cmd') {
    const enter = cwd ? `cd /D "${cwd}"` : ''
    if (command) return ['/c', enter ? `${enter} && ${command}` : command]
    // /K keeps cmd open after the `cd`.
    return enter ? ['/K', enter] : []
  }
  const enter = cwd ? `cd ${shSingleQuote(cwd)} && ` : ''
  if (command) return ['--login', '-c', `${enter}${command}`]
  return cwd ? ['--login', '-i', '-c', `${enter}exec bash -i`] : ['--login', '-i']
}

/** The command and arguments that launch `kind` in `cwd`, running `command` when given. */
export function locateShell(kind: ShellKind, cwd?: string, command?: string): ShellLaunch {
  if (process.platform === 'win32') {
    if (kind === 'pwsh') {
      const pwsh = found('pwsh')
      if (pwsh) return { command: pwsh, args: shellArgs('pwsh', cwd, command) }
      const ps = found('powershell')
      if (ps) return { command: ps, args: shellArgs('powershell', cwd, command) }
      throw new ShellNotFoundError('pwsh')
    }
    if (kind === 'powershell') {
      const ps = found('powershell')
      if (ps) return { command: ps, args: shellArgs('powershell', cwd, command) }
      throw new ShellNotFoundError('powershell')
    }
    if (kind === 'cmd') return { command: process.env.COMSPEC ?? 'cmd.exe', args: shellArgs('cmd', cwd, command) }
    const bash = found('bash')
    if (bash) return { command: bash, args: shellArgs('bash', cwd, command) }
    throw new ShellNotFoundError('bash')
  }
  if (kind === 'bash' || kind === 'cmd') {
    const shell = process.env.SHELL ?? '/bin/bash'
    const enter = cwd ? `cd ${shSingleQuote(cwd)} && ` : ''
    if (command) return { command: shell, args: ['-c', `${enter}${command}`] }
    return cwd ? { command: shell, args: ['-c', `${enter}exec ${shSingleQuote(shell)}`] } : { command: shell, args: [] }
  }
  const hit = found(kind)
  if (hit) return { command: hit, args: command ? ['-Command', command] : [] }
  throw new ShellNotFoundError(kind)
}
