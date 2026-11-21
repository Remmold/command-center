import { CONFIG_DIR_VAR } from '../../shared/profiles'

const ALWAYS_DROPPED = new Set(['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', CONFIG_DIR_VAR])

// Set by a running Claude Code session for its own children. Inherited, they make the
// app's sessions pose as children of whatever session launched the app.
const HOST_SESSION_VARS = new Set([
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_AGENT_SDK_VERSION',
  'CLAUDE_EFFORT',
  'ENABLE_IDE_INTEGRATION'
])

function isDropped(key: string, fromClaudeSession: boolean, vscodeTerminal: boolean): boolean {
  if (ALWAYS_DROPPED.has(key) || HOST_SESSION_VARS.has(key)) return true
  if (key.startsWith('VSCODE_')) return true
  if (vscodeTerminal && (key === 'TERM_PROGRAM' || key === 'TERM_PROGRAM_VERSION')) return true
  if (key === 'CLAUDE_CODE_ENTRYPOINT' || key === 'CLAUDE_CODE_SSE_PORT') return true
  return fromClaudeSession && key.startsWith('CLAUDE_CODE_')
}

/** The environment for a child process (claude or a shell), cleaned of the app's own launch context. */
export function childEnv(
  parent: Record<string, string | undefined>,
  extras: Record<string, string> = {}
): Record<string, string> {
  const fromClaudeSession = parent.CLAUDECODE !== undefined
  const vscodeTerminal = (parent.TERM_PROGRAM ?? '').toLowerCase() === 'vscode'
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined || isDropped(key, fromClaudeSession, vscodeTerminal)) continue
    out[key] = value
  }
  out.TERM = 'xterm-256color'
  out.COLORTERM = 'truecolor'
  return { ...out, ...extras }
}
