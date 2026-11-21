import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const ENTRY = join(__dirname, 'fake-claude.mjs')
const FIXTURES = join(__dirname, '..', '..', 'src', 'main', 'claude', 'fixtures')

type Line = Record<string, any>

function recordedInitialize(): Line {
  return JSON.parse(readFileSync(join(FIXTURES, 'initialize-reply.json'), 'utf-8')).response.response
}

class Fake {
  readonly lines: Line[] = []
  private buf = ''
  private waiters: Array<{ match: (l: Line) => boolean; resolve: (l: Line) => void; from: number }> = []
  private readonly child: ChildProcess
  readonly logFile: string
  private nextId = 0
  exited: Promise<number | null>

  constructor(dir: string, args: string[], env: Record<string, string>) {
    this.logFile = join(dir, 'fake.log')
    this.child = spawn(process.execPath, [ENTRY, ...args], {
      env: { ...process.env, FAKE_CLAUDE_LOG: this.logFile, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.exited = new Promise((resolve) => this.child.on('exit', resolve))
    this.child.stdout!.setEncoding('utf-8')
    this.child.stdout!.on('data', (chunk: string) => {
      this.buf += chunk
      let idx: number
      while ((idx = this.buf.indexOf('\n')) !== -1) {
        const text = this.buf.slice(0, idx).trim()
        this.buf = this.buf.slice(idx + 1)
        if (text) this.push(JSON.parse(text))
      }
    })
  }

  private push(line: Line): void {
    this.lines.push(line)
    for (const w of [...this.waiters]) {
      if (w.match(line)) {
        this.waiters.splice(this.waiters.indexOf(w), 1)
        w.resolve(line)
      }
    }
  }

  /** Resolves with the first line, seen so far or later, that matches. */
  next(match: (l: Line) => boolean, from = 0): Promise<Line> {
    const seen = this.lines.slice(from).find(match)
    if (seen) return Promise.resolve(seen)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out; got ' + JSON.stringify(this.lines.map((l) => l.type)))), 5000)
      this.waiters.push({ match, from, resolve: (l) => (clearTimeout(timer), resolve(l)) })
    })
  }

  write(line: Line): void {
    this.child.stdin!.write(JSON.stringify(line) + '\n')
  }

  async control(subtype: string, fields: Line = {}): Promise<Line> {
    const requestId = `req-${this.nextId++}`
    this.write({ type: 'control_request', request_id: requestId, request: { subtype, ...fields } })
    const reply = await this.next((l) => l.type === 'control_response' && l.response.request_id === requestId)
    return reply.response
  }

  say(text: string): void {
    this.write({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
  }

  log(): Line[] {
    return readFileSync(this.logFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }

  kill(): void {
    this.child.kill()
  }
}

let dirs: string[] = []
let fakes: Fake[] = []

function start(args: string[] = [], script?: unknown): Fake {
  const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'))
  dirs.push(dir)
  const env: Record<string, string> = {}
  if (script !== undefined) {
    env.FAKE_CLAUDE_SCRIPT = join(dir, 'script.json')
    writeFileSync(env.FAKE_CLAUDE_SCRIPT, JSON.stringify(script))
  }
  const fake = new Fake(dir, ['--input-format', 'stream-json', '--output-format', 'stream-json', ...args], env)
  fakes.push(fake)
  return fake
}

afterEach(async () => {
  for (const f of fakes) {
    f.kill()
    await f.exited
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  fakes = []
  dirs = []
})

describe('control replies', () => {
  it('answers initialize with the recorded reply and the launch permission mode', async () => {
    const fake = start(['--permission-mode', 'acceptEdits'])
    const reply = await fake.control('initialize', { hooks: null })
    const recorded = recordedInitialize()
    expect(reply.subtype).toBe('success')
    expect(reply.response.models).toEqual(recorded.models)
    expect(reply.response.account).toEqual(recorded.account)
    expect(reply.response.commands).toEqual(recorded.commands)
    expect(reply.response.current_permission_mode).toBe('acceptEdits')
  })

  it('answers get_usage with the recorded reply', async () => {
    const recorded = JSON.parse(readFileSync(join(FIXTURES, 'get-usage-reply.json'), 'utf-8')).response.response
    const reply = await start().control('get_usage')
    expect(reply.response).toEqual(recorded)
  })

  it('switches the permission mode and reports it as a status line', async () => {
    const fake = start()
    const reply = await fake.control('set_permission_mode', { mode: 'acceptEdits' })
    expect(reply).toMatchObject({ subtype: 'success', response: { mode: 'acceptEdits' } })
    const status = await fake.next((l) => l.type === 'system' && l.subtype === 'status' && 'permissionMode' in l)
    expect(status.permissionMode).toBe('acceptEdits')
  })

  it('refuses bypass unless the launch allowed it', async () => {
    const refused = await start().control('set_permission_mode', { mode: 'bypassPermissions' })
    expect(refused).toMatchObject({ subtype: 'error', error_code: 'bypass_not_launched' })
    const allowed = await start(['--allow-dangerously-skip-permissions']).control('set_permission_mode', { mode: 'bypassPermissions' })
    expect(allowed.subtype).toBe('success')
  })

  it('reflects apply_flag_settings and set_model in get_settings, like the real CLI', async () => {
    const fake = start(['--model', 'haiku'])
    expect((await fake.control('get_settings')).response.applied).toMatchObject({ model: 'claude-haiku-5-5', effort: 'medium' })
    const applied = await fake.control('apply_flag_settings', { settings: { model: 'sonnet', effortLevel: 'low' } })
    expect(applied).toEqual({ subtype: 'success', request_id: applied.request_id })
    const after = (await fake.control('get_settings')).response
    expect(after.effective).toEqual({ model: 'sonnet', effortLevel: 'low' })
    expect(after.sources).toEqual([{ source: 'flagSettings', settings: { model: 'sonnet', effortLevel: 'low' } }])
    expect(after.applied).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'low' })
    await fake.control('apply_flag_settings', { settings: { model: null } })
    expect((await fake.control('get_settings')).response.applied.model).toBe('claude-opus-5-5')
    await fake.control('set_model', { model: 'haiku' })
    expect((await fake.control('get_settings')).response.applied.model).toBe('claude-haiku-5-5')
  })

  it('accepts set_max_thinking_tokens with an empty success', async () => {
    const reply = await start().control('set_max_thinking_tokens', { max_thinking_tokens: 0 })
    expect(reply).toEqual({ subtype: 'success', request_id: reply.request_id })
  })

  it('rejects an unknown subtype with the recorded error wording', async () => {
    const reply = await start().control('no_such_subtype')
    expect(reply).toMatchObject({ subtype: 'error', error: 'Unsupported control request subtype: no_such_subtype' })
  })
})

const PARTIAL = ['--include-partial-messages']
const isResult = (l: Line): boolean => l.type === 'result'
const textDeltas = (fake: Fake): string[] =>
  fake.lines.filter((l) => l.type === 'stream_event' && l.event.delta?.type === 'text_delta').map((l) => l.event.delta.text)

describe('scripts', () => {
  it('answers any prompt with a short reply when no script is given', async () => {
    const fake = start(PARTIAL)
    fake.say('anything at all')
    const result = await fake.next(isResult)
    expect(result).toMatchObject({ subtype: 'success', is_error: false, result: 'Hello from the fake Claude.' })
    expect(fake.lines[0]).toMatchObject({ type: 'system', subtype: 'init', cwd: process.cwd() })
    expect(textDeltas(fake).join('')).toBe('Hello from the fake Claude.')
    const assistant = fake.lines.find((l) => l.type === 'assistant')!
    expect(assistant.message.content).toEqual([{ type: 'text', text: 'Hello from the fake Claude.' }])
  })

  it('plays the first unused turn whose pattern matches, then falls back to the default reply', async () => {
    const fake = start([], {
      turns: [
        { match: '^weather', events: [{ type: 'text', text: 'Sunny.' }] },
        { match: 'hello', flags: 'i', events: [{ type: 'text', text: 'Hi there.' }] }
      ]
    })
    fake.say('HELLO you')
    expect((await fake.next(isResult)).result).toBe('Hi there.')
    const seen = fake.lines.length
    fake.say('hello again')
    expect((await fake.next(isResult, seen)).result).toBe('Hello from the fake Claude.')
  })

  it('sends no stream_event lines without --include-partial-messages', async () => {
    const fake = start()
    fake.say('hi')
    await fake.next(isResult)
    expect(fake.lines.some((l) => l.type === 'stream_event')).toBe(false)
  })

  it('carries the resumed session id', async () => {
    const fake = start(['--resume', 'abc-123'])
    fake.say('hi')
    await fake.next(isResult)
    for (const line of fake.lines) if ('session_id' in line) expect(line.session_id).toBe('abc-123')
  })

  it('emits a rate_limit_event with the scripted utilization', async () => {
    const fake = start([], { turns: [{ match: '', events: [{ type: 'rate_limit_event', utilization: 0.42 }, { type: 'text', text: 'ok' }] }] })
    fake.say('hi')
    const event = await fake.next((l) => l.type === 'rate_limit_event')
    expect(event.rate_limit_info.unifiedWindows.seven_day.utilization).toBe(0.42)
  })
})

const WRITE = { type: 'tool_use', name: 'Write', input: { file_path: 'C:\\work\\hello.txt', content: 'hi' }, result: 'File created successfully' }
const isApproval = (l: Line): boolean => l.type === 'control_request' && l.request.subtype === 'can_use_tool'
const toolResults = (fake: Fake): Line[] => fake.lines.filter((l) => l.type === 'user').flatMap((l) => l.message.content)
const writeThenReply = { turns: [{ match: '', events: [WRITE, { type: 'text', text: 'Wrote it.' }] }] }

function reply(fake: Fake, request: Line, response: Line): void {
  fake.write({ type: 'control_response', response: { subtype: 'success', request_id: request.request_id, response } })
}

describe('tool approval', () => {
  it('asks can_use_tool and carries on when allowed', async () => {
    const fake = start(PARTIAL, writeThenReply)
    fake.say('write hello')
    const ask = await fake.next(isApproval)
    const toolUse = fake.lines.find((l) => l.type === 'assistant')!.message.content[0]
    expect(ask.request).toMatchObject({
      tool_name: 'Write',
      input: WRITE.input,
      description: 'hello.txt',
      permission_suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
      tool_use_id: toolUse.id
    })
    expect(fake.lines.some(isResult)).toBe(false)
    reply(fake, ask, { behavior: 'allow', updatedInput: WRITE.input, updatedPermissions: [] })
    const result = await fake.next(isResult)
    expect(result).toMatchObject({ subtype: 'success', result: 'Wrote it.' })
    expect(toolResults(fake)).toEqual([{ tool_use_id: toolUse.id, type: 'tool_result', content: 'File created successfully' }])
  })

  it('passes deny feedback back as an error tool_result and plays the deny path', async () => {
    const fake = start([], {
      turns: [{ match: '', events: [{ ...WRITE, onDeny: [{ type: 'text', text: 'Okay, I will not.' }] }, { type: 'text', text: 'Wrote it.' }] }]
    })
    fake.say('write hello')
    const ask = await fake.next(isApproval)
    reply(fake, ask, { behavior: 'deny', message: 'use bye.txt', interrupt: false })
    expect((await fake.next(isResult)).result).toBe('Okay, I will not.')
    expect(toolResults(fake)[0]).toMatchObject({ type: 'tool_result', content: 'use bye.txt', is_error: true })
  })

  it('ends the turn as interrupted on a deny with interrupt', async () => {
    const fake = start([], writeThenReply)
    fake.say('write hello')
    const ask = await fake.next(isApproval)
    reply(fake, ask, { behavior: 'deny', message: 'stop', interrupt: true })
    const result = await fake.next(isResult)
    expect(result).toMatchObject({ subtype: 'error_during_execution', is_error: true })
    expect(toolResults(fake)).toEqual([
      expect.objectContaining({ type: 'tool_result', is_error: true }),
      { type: 'text', text: '[Request interrupted by user for tool use]' }
    ])
  })

  it('fills {cwd} and {sep} in scripted tool input', async () => {
    const fake = start([], { turns: [{ match: '', events: [{ ...WRITE, input: { file_path: '{cwd}{sep}a.txt' } }] }] })
    fake.say('write')
    const ask = await fake.next(isApproval)
    expect(ask.request.input.file_path).toBe(join(process.cwd(), 'a.txt'))
  })

  it('stops asking once "allow edits for this session" was chosen', async () => {
    const fake = start([], { turns: [{ match: '', events: [WRITE, WRITE, { type: 'text', text: 'Both written.' }] }] })
    fake.say('write twice')
    const ask = await fake.next(isApproval)
    reply(fake, ask, { behavior: 'allow', updatedInput: WRITE.input, updatedPermissions: ask.request.permission_suggestions })
    expect((await fake.next(isResult)).result).toBe('Both written.')
    expect(fake.lines.filter(isApproval)).toHaveLength(1)
    expect(fake.lines.find((l) => l.type === 'system' && l.subtype === 'status' && l.permissionMode)?.permissionMode).toBe('acceptEdits')
  })
})

describe('ready scripts', () => {
  const ready = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, 'scripts', name), 'utf-8'))

  it('basic.json replies once per prompt', async () => {
    const fake = start([], ready('basic.json'))
    fake.say('hi')
    expect((await fake.next(isResult)).result).toBe('Hello! This is a scripted reply from the fake Claude.')
  })

  it('approval.json asks to Write hello.txt in the workspace, then replies', async () => {
    const fake = start([], ready('approval.json'))
    fake.say('make a file')
    const ask = await fake.next(isApproval)
    expect(ask.request).toMatchObject({ tool_name: 'Write', input: { file_path: join(process.cwd(), 'hello.txt'), content: 'hi' } })
    reply(fake, ask, { behavior: 'allow', updatedInput: ask.request.input, updatedPermissions: [] })
    expect((await fake.next(isResult)).result).toBe('Created hello.txt containing hi.')
  })
})

describe('interrupt', () => {
  it('stops a slow stream mid-reply with the interrupted result', async () => {
    const fake = start(PARTIAL, {
      turns: [{ match: '', deltaDelayMs: 150, events: [{ type: 'text', text: 'one two three four five six seven eight nine ten eleven twelve' }] }]
    })
    fake.say('talk slowly')
    await fake.next((l) => l.type === 'stream_event' && l.event.delta?.type === 'text_delta')
    const answer = await fake.control('interrupt')
    expect(answer.response).toEqual({ still_queued: [] })
    const result = await fake.next(isResult)
    expect(result).toMatchObject({ subtype: 'error_during_execution', is_error: true })
    expect(result).not.toHaveProperty('result')
    expect(textDeltas(fake).length).toBeLessThan(4)
    expect(toolResults(fake)).toEqual([{ type: 'text', text: '[Request interrupted by user]' }])
  })

  it('cancels a pending approval', async () => {
    const fake = start([], { turns: [{ match: '', events: [WRITE] }] })
    fake.say('write hello')
    const ask = await fake.next(isApproval)
    await fake.control('interrupt')
    const cancel = await fake.next((l) => l.type === 'control_cancel_request')
    expect(cancel.request_id).toBe(ask.request_id)
    expect((await fake.next(isResult)).subtype).toBe('error_during_execution')
    expect(toolResults(fake).at(-1)).toEqual({ type: 'text', text: '[Request interrupted by user for tool use]' })
  })
})

describe('log', () => {
  it('records argv, every received line and its own control requests in order', async () => {
    const fake = start(['--model', 'haiku', '--some-unknown-flag'], { turns: [{ match: '', events: [WRITE] }] })
    await fake.control('initialize', { hooks: null })
    fake.say('write hello')
    const ask = await fake.next(isApproval)
    reply(fake, ask, { behavior: 'allow', updatedInput: WRITE.input, updatedPermissions: [] })
    await fake.next(isResult)
    const log = fake.log()
    expect(log[0]).toMatchObject({ kind: 'argv', argv: expect.arrayContaining(['--model', 'haiku', '--some-unknown-flag']) })
    expect(log.slice(1).map((e) => `${e.kind} ${e.line.type}`)).toEqual([
      'received control_request',
      'received user',
      'sent control_request',
      'received control_response'
    ])
    expect(log[1].line.request.subtype).toBe('initialize')
    expect(log[3].line.request.subtype).toBe('can_use_tool')
    expect(log[4].line.response.response.behavior).toBe('allow')
  })
})
