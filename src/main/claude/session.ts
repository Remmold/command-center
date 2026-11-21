import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { join } from 'node:path'
import { locateClaude } from '../pty/claude-locator'
import {
  ensureHookScriptInstalled,
  hookCommandFor,
  writeSettingsLocal
} from '../permission/hookScript'
import { permissionServer } from '../permission/server'
import { CONFIG_DIR_VAR } from '../../shared/profiles'

function sanitizedEnv(extras: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k === 'ELECTRON_RUN_AS_NODE') continue
    if (k === 'ELECTRON_NO_ATTACH_CONSOLE') continue
    if (k === CONFIG_DIR_VAR) continue
    out[k] = v
  }
  out.TERM = 'xterm-256color'
  out.COLORTERM = 'truecolor'
  for (const [k, v] of Object.entries(extras)) out[k] = v
  return out
}

function hookScriptPath(): string {
  return join(app.getPath('userData'), 'permission-hook.cjs')
}

/**
 * Permission modes where we want our PreToolUse hook to fire and gate
 * tool execution through our UI. Bypass and plan modes skip the hook
 * entirely (bypass = trust everything, plan = no execution at all).
 */
const HOOK_MODES = new Set(['ask', 'acceptEdits'])

export type EventCallback = (paneId: string, event: unknown) => void
export type ExitCallback = (paneId: string, code: number | null) => void

export class ClaudeSession {
  private child: ChildProcess
  private buf = ''
  private alive = true

  constructor(
    public readonly paneId: string,
    public readonly cwd: string,
    private onEvent: EventCallback,
    private onExit: ExitCallback,
    model?: string,
    resumeSessionId?: string,
    permissionMode?: string,
    profileEnv: Record<string, string> = {}
  ) {
    const launch = locateClaude()
    const args = [
      ...launch.args,
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages'
    ]
    if (model) {
      args.push('--model', model)
    }
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId)
    }
    // Map "ask" to bypassPermissions so the CLI doesn't double-prompt;
    // our PreToolUse hook is the source of truth.
    const cliPermissionMode =
      permissionMode === 'ask' ? 'bypassPermissions' : permissionMode
    if (cliPermissionMode) {
      args.push('--permission-mode', cliPermissionMode)
    }

    const extraEnv: Record<string, string> = { ...profileEnv }
    const useHook = !!permissionMode && HOOK_MODES.has(permissionMode)
    if (useHook && permissionServer.port) {
      extraEnv.CC_PERMISSION_PORT = String(permissionServer.port)
      extraEnv.CC_PANE_ID = paneId
      extraEnv.CC_PERMISSION_MODE = permissionMode
      // Install hook synchronously enough — fire-and-forget; if the file
      // doesn't exist yet, the first tool call will fail to find it, but
      // the file is also written on app start so this is just a safety net.
      void ensureHookScriptInstalled(hookScriptPath())
        .then(() => writeSettingsLocal(cwd, hookCommandFor(hookScriptPath())))
        .catch((err) => console.error('[claude] failed to install hook', err))
    }

    console.log('[claude] spawn', {
      paneId,
      cwd,
      model,
      resume: resumeSessionId,
      permissionMode,
      configDir: profileEnv[CONFIG_DIR_VAR] ?? 'default',
      hookEnabled: useHook,
      command: launch.command,
      args
    })
    this.child = spawn(launch.command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: sanitizedEnv(extraEnv),
      shell: false,
      windowsHide: true
    })

    this.child.stdout?.setEncoding('utf-8')
    this.child.stdout?.on('data', (chunk: string) => this.handleStdout(chunk))
    this.child.stderr?.setEncoding('utf-8')
    this.child.stderr?.on('data', (chunk: string) => {
      console.error('[claude:stderr]', paneId, chunk)
    })
    this.child.on('exit', (code) => {
      this.alive = false
      console.log('[claude] exit', { paneId, code })
      this.onExit(paneId, code)
    })
    this.child.on('error', (err) => {
      console.error('[claude] error', paneId, err)
    })
  }

  private handleStdout(chunk: string): void {
    this.buf += chunk
    let idx: number
    while ((idx = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, idx).trim()
      this.buf = this.buf.slice(idx + 1)
      if (!line) continue
      try {
        const event = JSON.parse(line)
        this.onEvent(this.paneId, event)
      } catch (err) {
        console.error('[claude] failed to parse line', line, err)
      }
    }
  }

  send(
    text: string,
    images?: Array<{ media_type: string; data: string }>
  ): void {
    if (!this.alive) return
    const content: Array<unknown> = []
    if (images && images.length > 0) {
      for (const img of images) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.media_type, data: img.data }
        })
      }
    }
    if (text && text.length > 0) {
      content.push({ type: 'text', text })
    }
    if (content.length === 0) return
    const msg = { type: 'user', message: { role: 'user', content } }
    try {
      this.child.stdin?.write(JSON.stringify(msg) + '\n')
    } catch (err) {
      console.error('[claude] send failed', err)
    }
  }

  interrupt(): void {
    if (!this.alive) return
    // SIGINT to stop current turn but keep process alive
    try {
      this.child.kill('SIGINT')
    } catch {
      // ignore
    }
  }

  kill(): void {
    if (!this.alive) return
    this.alive = false
    try {
      this.child.stdin?.end()
    } catch {
      // ignore
    }
    try {
      this.child.kill()
    } catch {
      // ignore
    }
  }

  isAlive(): boolean {
    return this.alive
  }
}
