import { spawn, type ChildProcess } from 'node:child_process'
import { locateClaude } from '../pty/claude-locator'
import { CONFIG_DIR_VAR } from '../../shared/profiles'
import { THINKING_BUDGET, type ClaudeStartOptions, type SessionInit } from '../../shared/types'
import { childEnv } from '../util/childEnv'
import { ControlChannel, type ControlPayload, type IncomingHandler } from './controlChannel'
import { parseInitialize } from './initialize'


export type EventCallback = (paneId: string, event: unknown) => void
export type ExitCallback = (paneId: string, code: number | null) => void
export type InitCallback = (paneId: string, init: SessionInit) => void

export interface ClaudeSessionOptions extends ClaudeStartOptions {
  profileEnv?: Record<string, string>
  onEvent: EventCallback
  onExit: ExitCallback
  onInit: InitCallback
}

export class ClaudeSession {
  readonly paneId: string
  readonly cwd: string
  private child: ChildProcess
  private buf = ''
  private alive = true
  private readonly control: ControlChannel
  private init: SessionInit | null = null
  /** User messages wait for the handshake, so the CLI never sees a prompt before `initialize`. */
  private readonly handshake: Promise<void>

  constructor(options: ClaudeSessionOptions) {
    const { paneId, cwd, model, effort, thinking, resumeSessionId, permissionMode, allowBypass, profileEnv = {} } = options
    this.paneId = paneId
    this.cwd = cwd
    const launch = locateClaude()
    const args = [
      ...launch.args,
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool=stdio',
      '--setting-sources',
      'user,project,local'
    ]
    if (model) args.push('--model', model)
    if (effort) args.push('--effort', effort)
    if (thinking === false) args.push('--thinking=disabled')
    else args.push('--max-thinking-tokens', String(THINKING_BUDGET))
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId)
    }
    if (permissionMode) args.push('--permission-mode', permissionMode)
    // The CLI refuses a later switch to bypass unless the launch allowed it.
    if (allowBypass || permissionMode === 'bypassPermissions') args.push('--allow-dangerously-skip-permissions')

    console.log('[claude] spawn', {
      paneId,
      cwd,
      model,
      effort,
      thinking,
      resume: resumeSessionId,
      permissionMode,
      configDir: profileEnv[CONFIG_DIR_VAR] ?? 'default',
      command: launch.command,
      args
    })
    this.child = spawn(launch.command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv(process.env, profileEnv),
      shell: false,
      windowsHide: true
    })
    this.child.stdin?.on('error', (err) => {
      console.error('[claude] stdin error', paneId, err.message)
    })
    this.control = new ControlChannel({ write: (line) => this.writeLine(line) })

    this.child.stdout?.setEncoding('utf-8')
    this.child.stdout?.on('data', (chunk: string) => this.handleStdout(chunk, options.onEvent))
    this.child.stderr?.setEncoding('utf-8')
    this.child.stderr?.on('data', (chunk: string) => {
      console.error('[claude:stderr]', paneId, chunk)
    })
    this.child.on('exit', (code) => {
      this.alive = false
      console.log('[claude] exit', { paneId, code })
      options.onExit(paneId, code)
      // After onExit, so the status tracker has already gone idle when open approvals drop.
      this.control.close('claude process exited')
    })
    this.child.on('error', (err) => {
      console.error('[claude] error', paneId, err)
    })

    this.handshake = this.control
      .request('initialize', { hooks: null })
      .then((response) => {
        this.init = parseInitialize(response)
        options.onInit(paneId, this.init)
      })
      .catch((err: Error) => {
        console.error('[claude] initialize failed', paneId, err.message)
      })
  }

  private writeLine(line: string): void {
    if (!this.alive) return
    try {
      this.child.stdin?.write(line)
    } catch (err) {
      console.error('[claude] stdin write failed', this.paneId, err)
    }
  }

  private handleStdout(chunk: string, onEvent: EventCallback): void {
    this.buf += chunk
    let idx: number
    while ((idx = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, idx).trim()
      this.buf = this.buf.slice(idx + 1)
      if (!line) continue
      let event: unknown
      try {
        event = JSON.parse(line)
      } catch (err) {
        console.error('[claude] failed to parse line', line, err)
        continue
      }
      if (this.control.accept(event)) continue
      onEvent(this.paneId, event)
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
    const line = JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n'
    void this.handshake.then(() => this.writeLine(line))
  }

  request(subtype: string, fields: ControlPayload = {}): Promise<ControlPayload> {
    if (!this.alive) return Promise.reject(new Error('claude process is not running'))
    return this.control.request(subtype, fields)
  }

  setIncomingHandler(handler: IncomingHandler | null): void {
    this.control.setIncomingHandler(handler)
  }

  initInfo(): SessionInit | null {
    return this.init
  }

  /** Stops the current turn; the process keeps running. */
  interrupt(): void {
    if (!this.alive) return
    this.request('interrupt').catch((err: Error) => {
      console.error('[claude] interrupt failed', this.paneId, err.message)
    })
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
