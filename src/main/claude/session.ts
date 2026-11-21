import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import { locateClaude } from '../pty/claude-locator'
import { hookCommandFor } from '../permission/hookScript'
import { hookSettings, permissionLaunch } from '../permission/launch'
import { permissionServer } from '../permission/server'
import { CONFIG_DIR_VAR } from '../../shared/profiles'
import { childEnv } from '../util/childEnv'


function hookScriptPath(): string {
  return join(app.getPath('userData'), 'permission-hook.cjs')
}

function hookSettingsPath(): string {
  const path = join(app.getPath('userData'), 'permission-settings.json')
  writeFileSync(path, JSON.stringify(hookSettings(hookCommandFor(hookScriptPath()))), 'utf-8')
  return path
}

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
    const permissions = permissionLaunch(permissionMode, permissionServer.port ?? null, paneId)
    if (permissions.cliMode) args.push('--permission-mode', permissions.cliMode)
    if (permissions.useHook) args.push('--settings', hookSettingsPath())
    const extraEnv: Record<string, string> = { ...profileEnv, ...permissions.env }

    console.log('[claude] spawn', {
      paneId,
      cwd,
      model,
      resume: resumeSessionId,
      permissionMode,
      configDir: profileEnv[CONFIG_DIR_VAR] ?? 'default',
      hookEnabled: permissions.useHook,
      command: launch.command,
      args
    })
    this.child = spawn(launch.command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv(process.env, extraEnv),
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
