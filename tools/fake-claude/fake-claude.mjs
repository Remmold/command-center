#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, '..', '..', 'src', 'main', 'claude', 'fixtures')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'))
const readLines = (path) =>
  readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
const clone = (value) => structuredClone(value)

const recorded = {
  initialize: readJson(join(FIXTURES, 'initialize-reply.json')).response.response,
  usage: readJson(join(FIXTURES, 'get-usage-reply.json')).response.response,
  unsupported: readJson(join(FIXTURES, 'error-reply.json')).response.error,
  turn: readLines(join(FIXTURES, 'turn-write-approval.jsonl')),
  queued: readLines(join(FIXTURES, 'turn-queued-message.jsonl'))
    .filter((entry) => entry.direction === 'cli')
    .map((entry) => entry.line),
  control: readLines(join(FIXTURES, 'control-replies.jsonl'))
    .filter((entry) => entry.direction === 'cli')
    .map((entry) => entry.line)
}

function recordedLine(match) {
  const hit = recorded.turn.find(match)
  if (!hit) throw new Error('fake-claude: fixture line missing')
  return clone(hit)
}

const isStream = (type, extra = () => true) => (l) => l.type === 'stream_event' && l.event.type === type && extra(l.event)

const template = {
  init: recordedLine((l) => l.type === 'system' && l.subtype === 'init'),
  requesting: recordedLine((l) => l.type === 'system' && l.subtype === 'status'),
  messageStart: recordedLine(isStream('message_start')),
  toolBlockStart: recordedLine(isStream('content_block_start', (e) => e.content_block.type === 'tool_use')),
  textBlockStart: recordedLine(isStream('content_block_start', (e) => e.content_block.type === 'text')),
  inputDelta: recordedLine(isStream('content_block_delta', (e) => e.delta.type === 'input_json_delta')),
  textDelta: recordedLine(isStream('content_block_delta', (e) => e.delta.type === 'text_delta')),
  blockStop: recordedLine(isStream('content_block_stop')),
  messageDelta: recordedLine(isStream('message_delta', (e) => e.delta.stop_reason === 'end_turn')),
  messageStop: recordedLine(isStream('message_stop')),
  assistant: recordedLine((l) => l.type === 'assistant'),
  rateLimit: recordedLine((l) => l.type === 'rate_limit_event'),
  canUseTool: recordedLine((l) => l.type === 'control_request').request,
  toolResult: recordedLine((l) => l.type === 'user'),
  result: recordedLine((l) => l.type === 'result'),
  settings: clone(recorded.control.find((l) => l.response?.response?.applied).response.response),
  permissionStatus: clone(recorded.control.find((l) => l.type === 'system' && 'permissionMode' in l)),
  bypassRefused: clone(recorded.control.find((l) => l.response?.error_code === 'bypass_not_launched').response),
  lifecycle: clone(recorded.queued.find((l) => l.type === 'command_lifecycle')),
  replay: clone(recorded.queued.find((l) => l.type === 'user' && l.isReplay)),
  interruptReply: clone(recorded.control.find((l) => l.response?.response && 'still_queued' in l.response.response).response.response)
}

const INTERRUPTED = '[Request interrupted by user]'
const INTERRUPTED_TOOL = '[Request interrupted by user for tool use]'
const REJECTED =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const BOOLEAN_FLAGS = new Set([
  '--print',
  '-p',
  '--verbose',
  '--include-partial-messages',
  '--allow-dangerously-skip-permissions',
  '--dangerously-skip-permissions',
  '--no-session-persistence',
  '--replay-user-messages'
])
const DEFAULT_SCRIPT = { turns: [{ match: '', repeat: true, events: [{ type: 'text', text: 'Hello from the fake Claude.' }] }] }

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('-')) continue
    const eq = arg.indexOf('=')
    if (eq !== -1) flags[arg.slice(0, eq)] = arg.slice(eq + 1)
    else if (BOOLEAN_FLAGS.has(arg) || i + 1 >= argv.length || argv[i + 1].startsWith('-')) flags[arg] = true
    else flags[arg] = argv[++i]
  }
  return flags
}

function loadScript(path) {
  if (!path) return DEFAULT_SCRIPT
  const script = readJson(path)
  if (!Array.isArray(script.turns)) throw new Error(`fake-claude: ${path} has no "turns" array`)
  return script
}

function fill(value) {
  if (typeof value === 'string') return value.replaceAll('{cwd}', process.cwd()).replaceAll('{sep}', sep)
  if (Array.isArray(value)) return value.map(fill)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]))
  return value
}

function textOf(message) {
  const content = message?.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function chunk(text) {
  const words = text.match(/\S+\s*/g) ?? [text]
  const out = []
  for (let i = 0; i < words.length; i += 3) out.push(words.slice(i, i + 3).join(''))
  return out
}

class Fake {
  constructor({ argv, script, logFile, write }) {
    this.flags = parseArgs(argv)
    this.script = script
    this.logFile = logFile
    this.out = write
    const resume = [this.flags['--resume'], this.flags['--session-id']].find((v) => typeof v === 'string')
    this.sessionId = resume ?? randomUUID()
    this.permissionMode = this.flags['--permission-mode'] || 'default'
    this.bypassAllowed =
      this.flags['--allow-dangerously-skip-permissions'] === true ||
      this.flags['--dangerously-skip-permissions'] === true ||
      this.permissionMode === 'bypassPermissions'
    this.partial = this.flags['--include-partial-messages'] === true
    this.replays = this.flags['--replay-user-messages'] === true
    this.model = this.flags['--model'] || 'default'
    this.effort = this.flags['--effort'] || 'medium'
    this.flagSettings = {}
    this.allowedRules = []
    this.used = new Set()
    this.queue = []
    this.running = null
    this.pendingApprovals = new Map()
    this.counter = 0
    this.log({ kind: 'argv', argv, cwd: process.cwd(), configDir: process.env.CLAUDE_CONFIG_DIR ?? null })
  }

  log(entry) {
    if (this.logFile) appendFileSync(this.logFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
  }

  send(line) {
    if (line.type === 'control_request' || line.type === 'control_cancel_request') this.log({ kind: 'sent', line })
    this.out(JSON.stringify(line) + '\n')
  }

  id(prefix) {
    return `${prefix}${String(++this.counter).padStart(4, '0')}`
  }

  stamp(line) {
    if ('session_id' in line) line.session_id = this.sessionId
    if ('uuid' in line) line.uuid = randomUUID()
    if ('timestamp' in line) line.timestamp = new Date().toISOString()
    return line
  }

  resolvedModel() {
    const models = recorded.initialize.models
    const hit = models.find((m) => m.value === this.model) ?? (this.model === 'default' ? models[0] : null)
    return hit?.resolvedModel ?? this.model
  }

  receive(text) {
    let line
    try {
      line = JSON.parse(text)
    } catch {
      this.log({ kind: 'received', raw: text })
      return
    }
    this.log({ kind: 'received', line })
    if (line.type === 'control_request') this.answer(line.request_id, line.request ?? {})
    else if (line.type === 'control_response') this.settleApproval(line.response ?? {})
    else if (line.type === 'user') {
      const prompt = { text: textOf(line), uuid: typeof line.uuid === 'string' ? line.uuid : null, content: line.message?.content }
      this.queue.push(prompt)
      this.lifecycle(prompt, 'queued')
      this.pump()
    }
  }

  /** Prompts sent without a uuid get no frames, as in the real CLI. */
  lifecycle(prompt, state) {
    if (!prompt.uuid) return
    const line = clone(template.lifecycle)
    line.command_uuid = prompt.uuid
    line.state = state
    this.send(this.stamp(line))
  }

  replay(prompt) {
    if (!this.replays || !prompt.uuid) return
    const line = this.stamp(clone(template.replay))
    line.uuid = prompt.uuid
    line.message.content = clone(prompt.content)
    this.send(line)
  }

  answer(requestId, request) {
    const ok = (response) =>
      this.send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, ...(response ? { response } : {}) } })
    switch (request.subtype) {
      case 'initialize':
        return ok({ ...clone(recorded.initialize), pid: process.pid, current_permission_mode: this.permissionMode })
      case 'get_usage':
        return ok(clone(recorded.usage))
      case 'set_permission_mode': {
        if (request.mode === 'bypassPermissions' && !this.bypassAllowed) {
          return this.send({ type: 'control_response', response: { ...clone(template.bypassRefused), request_id: requestId } })
        }
        ok({ mode: request.mode })
        return this.setMode(request.mode)
      }
      case 'apply_flag_settings':
        for (const [key, value] of Object.entries(request.settings ?? {})) {
          if (value === null) delete this.flagSettings[key]
          else this.flagSettings[key] = value
          if (key === 'model') this.model = value ?? 'default'
          if (key === 'effortLevel') this.effort = value ?? this.flags['--effort'] ?? 'medium'
        }
        return ok()
      case 'set_model':
        this.model = request.model ?? 'default'
        return ok()
      case 'set_max_thinking_tokens':
        return ok()
      case 'get_settings': {
        const reply = clone(template.settings)
        reply.effective = clone(this.flagSettings)
        reply.sources = Object.keys(this.flagSettings).length ? [{ source: 'flagSettings', settings: clone(this.flagSettings) }] : []
        reply.applied = { ...reply.applied, model: this.resolvedModel(), effort: this.effort }
        return ok(reply)
      }
      case 'interrupt':
        ok(clone(template.interruptReply))
        return this.running?.abort()
      default:
        return this.send({
          type: 'control_response',
          response: { subtype: 'error', request_id: requestId, error: recorded.unsupported.replace(/: .*$/, `: ${request.subtype}`) }
        })
    }
  }

  setMode(mode) {
    this.permissionMode = mode
    const status = clone(template.permissionStatus)
    status.permissionMode = mode
    this.send(this.stamp(status))
  }

  settleApproval(response) {
    const pending = this.pendingApprovals.get(response.request_id)
    if (!pending) return
    this.pendingApprovals.delete(response.request_id)
    if (response.subtype === 'error') pending.resolve({ behavior: 'deny', message: response.error ?? 'denied', interrupt: false })
    else pending.resolve(response.response ?? {})
  }

  pickTurn(text) {
    const turns = this.script.turns
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]
      if (this.used.has(i) && !turn.repeat) continue
      if (!new RegExp(turn.match ?? '', turn.flags ?? '').test(text)) continue
      this.used.add(i)
      return turn
    }
    return DEFAULT_SCRIPT.turns[0]
  }

  async pump() {
    if (this.running) return
    while (this.queue.length) {
      const prompt = this.queue.shift()
      this.lifecycle(prompt, 'started')
      const turn = new Turn(this, this.pickTurn(prompt.text), prompt)
      this.running = turn
      try {
        await turn.run()
        this.lifecycle(prompt, turn.interrupted ? 'cancelled' : 'completed')
      } catch (err) {
        process.stderr.write(`fake-claude: ${err.message}
`)
      }
      this.running = null
    }
    if (this.stdinClosed) process.exit(0)
  }

  autoAllowed(tool) {
    if (this.permissionMode === 'bypassPermissions') return true
    if (this.permissionMode === 'acceptEdits' && EDIT_TOOLS.has(tool)) return true
    return this.allowedRules.includes(tool)
  }

  remember(permissions) {
    for (const p of permissions ?? []) {
      if (p.type === 'setMode' && typeof p.mode === 'string') this.setMode(p.mode)
      if (p.type === 'addRules') for (const rule of p.rules ?? []) if (!rule.ruleContent) this.allowedRules.push(rule.toolName)
    }
  }
}

class Turn {
  constructor(fake, script, prompt) {
    this.fake = fake
    this.script = script
    this.prompt = prompt
    /** Prompts that arrived during a tool call and joined this turn after its result. */
    this.folded = []
    this.interrupted = false
    this.aborted = false
    this.wakers = new Set()
    this.lastText = ''
    this.numTurns = 1
    this.awaitingTool = null
  }

  abort() {
    this.aborted = true
    for (const wake of this.wakers) wake()
  }

  sleep(ms) {
    if (!ms || this.aborted) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.wakers.delete(done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      this.wakers.add(done)
    })
  }

  emit(line) {
    this.fake.send(this.fake.stamp(line))
  }

  stream(line) {
    if (this.fake.partial) this.emit(line)
  }

  async run() {
    const init = clone(template.init)
    init.cwd = process.cwd()
    init.model = this.fake.resolvedModel()
    init.permissionMode = this.fake.permissionMode
    this.emit(init)
    this.fake.replay(this.prompt)
    let ended = await this.play(this.script.events ?? [])
    for (let i = 0; i < this.folded.length && !ended && !this.aborted; i++) {
      ended = await this.play(this.fake.pickTurn(this.folded[i].text).events ?? [])
    }
    if (this.aborted && !this.interrupted) return this.endInterrupted(this.awaitingTool)
    if (!ended) this.endSuccess()
  }

  foldQueued() {
    const fake = this.fake
    while (fake.queue.length) {
      const prompt = fake.queue.shift()
      fake.replay(prompt)
      fake.lifecycle(prompt, 'started')
      this.folded.push(prompt)
    }
  }

  settleFolded(state) {
    for (const prompt of this.folded) this.fake.lifecycle(prompt, state)
  }

  /** True once a result has been sent. */
  async play(events) {
    for (const raw of events) {
      const event = fill(raw)
      if (this.aborted) return false
      await this.sleep(event.delayMs)
      if (this.aborted) return false
      switch (event.type) {
        case 'text':
          await this.text(event)
          break
        case 'tool_use':
          if (await this.toolUse(event)) return true
          break
        case 'rate_limit_event':
          this.rateLimit(event)
          break
        case 'result':
          if (event.error) this.endInterrupted(null)
          else this.endSuccess(event.text)
          return true
        case 'raw':
          this.fake.send(event.line)
          break
        case 'wait':
          await this.sleep(event.ms)
          break
        default:
          throw new Error(`fake-claude: unknown event type ${event.type}`)
      }
    }
    return false
  }

  startMessage(messageId) {
    this.emit(clone(template.requesting))
    const start = clone(template.messageStart)
    start.event.message.id = messageId
    start.event.message.model = this.fake.resolvedModel()
    this.stream(start)
  }

  endMessage(stopReason) {
    this.stream(clone(template.blockStop))
    const delta = clone(template.messageDelta)
    delta.event.delta.stop_reason = stopReason
    this.stream(delta)
    this.stream(clone(template.messageStop))
  }

  assistant(messageId, block) {
    const line = clone(template.assistant)
    line.message.id = messageId
    line.message.model = this.fake.resolvedModel()
    line.message.content = [block]
    line.request_id = this.fake.id('req_fake')
    return line
  }

  async text(event) {
    const messageId = this.fake.id('msg_fake')
    this.startMessage(messageId)
    this.stream(clone(template.textBlockStart))
    let sent = ''
    for (const piece of event.deltas ?? chunk(event.text ?? '')) {
      await this.sleep(event.deltaDelayMs ?? this.script.deltaDelayMs)
      if (this.aborted) return
      const delta = clone(template.textDelta)
      delta.event.delta.text = piece
      this.stream(delta)
      sent += piece
    }
    this.lastText = event.text ?? sent
    this.emit(this.assistant(messageId, { type: 'text', text: this.lastText }))
    this.endMessage('end_turn')
  }

  /** True when the tool call ended the turn. */
  async toolUse(event) {
    const fake = this.fake
    const messageId = fake.id('msg_fake')
    const toolUseId = fake.id('toolu_fake')
    const input = event.input ?? {}
    this.startMessage(messageId)
    const blockStart = clone(template.toolBlockStart)
    blockStart.event.content_block.id = toolUseId
    blockStart.event.content_block.name = event.name
    this.stream(blockStart)
    const delta = clone(template.inputDelta)
    delta.event.delta.partial_json = JSON.stringify(input)
    this.stream(delta)
    const block = { ...clone(template.assistant.message.content[0]), type: 'tool_use', id: toolUseId, name: event.name, input }
    const assistant = this.assistant(messageId, block)
    delete assistant.wire_tool_inputs
    this.emit(assistant)
    this.endMessage('tool_use')
    this.numTurns++

    let decision = { behavior: 'allow', updatedInput: input }
    if (event.approval !== false && !fake.autoAllowed(event.name)) {
      decision = await this.ask(event, toolUseId, input)
      if (this.aborted) return false
    }
    if (decision.behavior === 'allow') {
      fake.remember(decision.updatedPermissions)
      this.toolResult(toolUseId, event.result ?? 'Done.', false)
      this.foldQueued()
      return false
    }
    if (decision.interrupt) {
      this.toolResult(toolUseId, decision.message || REJECTED, true, INTERRUPTED_TOOL)
      this.endInterrupted(null, true)
      return true
    }
    this.toolResult(toolUseId, decision.message || REJECTED, true)
    this.foldQueued()
    if (event.onDeny) return (await this.play(event.onDeny)) || this.finishEarly()
    return false
  }

  finishEarly() {
    if (this.aborted) return false
    this.endSuccess()
    return true
  }

  ask(event, toolUseId, input) {
    const fake = this.fake
    const requestId = randomUUID()
    const request = clone(template.canUseTool)
    request.tool_name = event.name
    request.display_name = event.name
    request.input = input
    request.description = event.description ?? (typeof input.file_path === 'string' ? basename(input.file_path) : event.name)
    request.permission_suggestions = event.suggestions ?? (EDIT_TOOLS.has(event.name) ? clone(template.canUseTool.permission_suggestions) : [])
    request.tool_use_id = toolUseId
    this.awaitingTool = toolUseId
    return new Promise((resolve) => {
      const wake = () => {
        fake.pendingApprovals.delete(requestId)
        fake.send({ type: 'control_cancel_request', request_id: requestId })
        resolve(null)
      }
      this.wakers.add(wake)
      fake.pendingApprovals.set(requestId, {
        resolve: (decision) => {
          this.wakers.delete(wake)
          this.awaitingTool = null
          resolve(decision)
        }
      })
      fake.send({ type: 'control_request', request_id: requestId, request })
    })
  }

  userMessage(content) {
    const line = clone(template.toolResult)
    line.message.content = content
    delete line.tool_use_result
    delete line.tool_result_meta
    this.emit(line)
  }

  toolResult(toolUseId, content, isError, note) {
    const block = { tool_use_id: toolUseId, type: 'tool_result', content }
    if (isError) block.is_error = true
    this.userMessage(note ? [block, { type: 'text', text: note }] : [block])
  }

  endSuccess(text) {
    this.settleFolded('completed')
    const result = clone(template.result)
    result.result = text ?? this.lastText
    result.num_turns = this.numTurns
    this.emit(result)
  }

  endInterrupted(pendingToolUseId, noteSent = false) {
    this.interrupted = true
    this.settleFolded('cancelled')
    if (!noteSent) {
      if (pendingToolUseId) this.toolResult(pendingToolUseId, REJECTED, true, INTERRUPTED_TOOL)
      else this.userMessage([{ type: 'text', text: INTERRUPTED }])
    }
    const result = clone(template.result)
    delete result.result
    delete result.terminal_reason
    result.subtype = 'error_during_execution'
    result.is_error = true
    result.stop_reason = null
    result.num_turns = this.numTurns
    result.errors = []
    this.emit(result)
  }

  rateLimit(event) {
    const line = clone(template.rateLimit)
    if (typeof event.utilization === 'number') {
      for (const window of Object.values(line.rate_limit_info.unifiedWindows ?? {})) window.utilization = event.utilization
    }
    this.emit(line)
  }
}

function main() {
  const fake = new Fake({
    argv: process.argv.slice(2),
    script: loadScript(process.env.FAKE_CLAUDE_SCRIPT),
    logFile: process.env.FAKE_CLAUDE_LOG,
    write: (text) => process.stdout.write(text)
  })
  let buf = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (data) => {
    buf += data
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const text = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (text) fake.receive(text)
    }
  })
  process.stdin.on('end', () => {
    fake.stdinClosed = true
    if (fake.running?.awaitingTool) fake.running.abort()
    if (!fake.running && fake.queue.length === 0) process.exit(0)
  })
}

main()
