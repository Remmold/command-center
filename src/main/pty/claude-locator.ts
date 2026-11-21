import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ClaudeLaunch {
  command: string
  args: string[]
  /** Variables the launch itself needs, applied after the cleaned child environment. */
  env?: Record<string, string>
}

export const FAKE_CLAUDE_VAR = 'CC_CLAUDE_BIN'

export class ClaudeNotFoundError extends Error {
  constructor(detail?: string) {
    super(
      'Could not find the `claude` CLI on PATH. Install Claude Code from https://docs.claude.com/en/docs/claude-code and ensure it is on your PATH.' +
        (detail ? ` (${detail})` : '')
    )
    this.name = 'ClaudeNotFoundError'
  }
}

let cached: ClaudeLaunch | null = null

function where(name: string): string[] {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(cmd, [name], { encoding: 'utf-8', shell: false })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function extractTargetFromCmdWrapper(cmdPath: string): string | null {
  let content: string
  try {
    content = readFileSync(cmdPath, 'utf-8')
  } catch {
    return null
  }
  // npm-generated wrappers reference the real binary as "%~dp0\path" or "%dp0%\path".
  const match = content.match(/"(?:%~dp0|%dp0%)([\\/][^"]+)"/i)
  if (!match) return null
  const rel = match[1].replace(/^[\\/]+/, '').replace(/\\/g, '/')
  const full = join(dirname(cmdPath), rel)
  return existsSync(full) ? full : null
}

function findNode(): string | null {
  const hits = where('node')
  return hits.find((p) => p.toLowerCase().endsWith('.exe')) ?? hits[0] ?? null
}

function resolveWindowsLaunch(): ClaudeLaunch {
  const hits = where('claude')
  const exeHit = hits.find((p) => p.toLowerCase().endsWith('.exe'))
  if (exeHit && existsSync(exeHit)) return { command: exeHit, args: [] }

  const cmdHit = hits.find((p) => p.toLowerCase().endsWith('.cmd'))
  if (!cmdHit || !existsSync(cmdHit)) throw new ClaudeNotFoundError()

  const target = extractTargetFromCmdWrapper(cmdHit)
  if (!target) {
    throw new ClaudeNotFoundError(`could not resolve target from ${cmdHit}`)
  }

  const lower = target.toLowerCase()
  if (lower.endsWith('.exe')) {
    return { command: target, args: [] }
  }
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    const node = findNode()
    if (!node || !existsSync(node)) {
      throw new ClaudeNotFoundError('node not found on PATH')
    }
    return { command: node, args: [target] }
  }
  // Unknown target type — try executing it directly.
  return { command: target, args: [] }
}

function resolveUnixLaunch(): ClaudeLaunch {
  const claude = where('claude')[0]
  if (!claude || !existsSync(claude)) throw new ClaudeNotFoundError()
  return { command: claude, args: [] }
}

/** Under the fake CLI only, so an inherited CLAUDE_CONFIG_DIR never moves the real Default profile. */
export function harnessConfigDir(env: Record<string, string | undefined> = process.env): string | null {
  return (env[FAKE_CLAUDE_VAR] && env.CLAUDE_CONFIG_DIR) || null
}

/** With CC_CLAUDE_BIN set (tests only), the script it names, run by this Electron or Node binary as plain Node. */
export function locateClaude(): ClaudeLaunch {
  const fake = process.env[FAKE_CLAUDE_VAR]
  if (fake) return { command: process.execPath, args: [fake], env: { ELECTRON_RUN_AS_NODE: '1' } }
  if (cached) return cached
  cached = process.platform === 'win32' ? resolveWindowsLaunch() : resolveUnixLaunch()
  return cached
}
