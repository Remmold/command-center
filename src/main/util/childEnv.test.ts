import { describe, expect, it } from 'vitest'
import { childEnv } from './childEnv'

describe('childEnv', () => {
  it('drops Electron launch flags and the inherited config folder', () => {
    const env = childEnv({ PATH: 'p', ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1', CLAUDE_CONFIG_DIR: 'x' })
    expect(env).toEqual({ PATH: 'p', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  })

  it('drops the identity of a Claude Code session the app was launched from', () => {
    const env = childEnv({
      PATH: 'p',
      CLAUDECODE: '1',
      CLAUDE_PID: '42',
      CLAUDE_AGENT_SDK_VERSION: '1.0',
      CLAUDE_EFFORT: 'high',
      CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
      CLAUDE_CODE_SESSION_ID: 's',
      CLAUDE_CODE_MESSAGING_SOCKET: 'sock',
      CLAUDE_CODE_MESSAGING_TOKEN: 't',
      CLAUDE_CODE_SSE_PORT: '1234',
      ENABLE_IDE_INTEGRATION: 'true'
    })
    expect(env).toEqual({ PATH: 'p', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  })

  it('keeps Claude Code settings the user set when not launched from a Claude session', () => {
    const env = childEnv({ PATH: 'p', CLAUDE_CODE_USE_BEDROCK: '1' })
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1')
  })

  it('drops VS Code terminal markers so the CLI does not think it runs inside VS Code', () => {
    const env = childEnv({ PATH: 'p', VSCODE_PID: '7', VSCODE_IPC_HOOK: 'h', TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.9' })
    expect(env).toEqual({ PATH: 'p', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  })

  it('keeps a TERM_PROGRAM that is not VS Code', () => {
    expect(childEnv({ TERM_PROGRAM: 'WezTerm' }).TERM_PROGRAM).toBe('WezTerm')
  })

  it('applies extras last', () => {
    const env = childEnv({ PATH: 'p', CLAUDECODE: '1' }, { CLAUDE_CONFIG_DIR: 'profile', TERM: 'dumb' })
    expect(env).toMatchObject({ CLAUDE_CONFIG_DIR: 'profile', TERM: 'dumb' })
    expect(env.CLAUDECODE).toBeUndefined()
  })
})
