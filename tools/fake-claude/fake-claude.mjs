#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
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

/** A test's `fake-account.json` in the config folder replaces the recorded account, so two profiles can differ. */
function accountFor(recordedAccount) {
  const dir = process.env.CLAUDE_CONFIG_DIR
  if (!dir) return recordedAccount
  try {
    return JSON.parse(readFileSync(join(dir, 'fake-account.json'), 'utf-8'))
  } catch {
    return recordedAccount
  }
}

const recorded = {
  initialize: readJson(join(FIXTURES, 'initialize-reply.json')).response.response,
  usage: readJson(join(FIXTURES, 'get-usage-reply.json')).response.response,
  context: readJson(join(FIXTURES, 'get-context-usage-reply.json')).response.response,
  unsupported: readJson(join(FIXTURES, 'error-reply.json')).response.error,
  turn: readLines(join(FIXTURES, 'turn-write-approval.jsonl')),
  thinking: readLines(join(FIXTURES, 'turn-thinking.jsonl')),
  queued: readLines(join(FIXTURES, 'turn-queued-message.jsonl'))
    .filter((entry) => entry.direction === 'cli')
    .map((entry) => entry.line),
  control: readLines(join(FIXTURES, 'control-replies.jsonl'))
    .filter((entry) => entry.direction === 'cli')
    .map((entry) => entry.line),
  remoteControl: readLines(join(FIXTURES, 'remote-control-replies.jsonl'))
    .filter((entry) => entry.direction === 'cli')
    .map((entry) => entry.line)
}

function recordedLine(match) {
  const hit = recorded.turn.find(match)
  if (!hit) throw new Error('fake-claude: fixture line missing')
  return clone(hit)
}

const isStream = (type, extra = () => true) => (l) => l.type === 'stream_event' && l.event.type === type && extra(l.event)

function thinkingLine(match) {
  const hit = recorded.thinking.find(match)
  if (!hit) throw new Error('fake-claude: thinking fixture line missing')
  return clone(hit)
}

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
  thinkingBlockStart: thinkingLine(isStream('content_block_start', (e) => e.content_block.type === 'thinking')),
  thinkingDelta: thinkingLine(isStream('content_block_delta', (e) => e.delta.type === 'thinking_delta')),
  signatureDelta: thinkingLine(isStream('content_block_delta', (e) => e.delta.type === 'signature_delta')),
  thinkingTokens: thinkingLine((l) => l.type === 'system' && l.subtype === 'thinking_tokens'),
  thinkingAssistant: thinkingLine((l) => l.type === 'assistant' && l.message.content[0]?.type === 'thinking'),
  canUseTool: recordedLine((l) => l.type === 'control_request').request,
  toolResult: recordedLine((l) => l.type === 'user'),
  result: recordedLine((l) => l.type === 'result'),
  settings: clone(recorded.control.find((l) => l.response?.response?.applied).response.response),
  permissionStatus: clone(recorded.control.find((l) => l.type === 'system' && 'permissionMode' in l)),
  bypassRefused: clone(recorded.control.find((l) => l.response?.error_code === 'bypass_not_launched').response),
  lifecycle: clone(recorded.queued.find((l) => l.type === 'command_lifecycle')),
  replay: clone(recorded.queued.find((l) => l.type === 'user' && l.isReplay)),
  bridgeReady: clone(recorded.remoteControl.find((l) => l.subtype === 'bridge_state' && l.state === 'ready')),
  remoteControlReply: clone(recorded.remoteControl.find((l) => l.response?.response?.session_url).response.response),
  interruptReply: clone(recorded.control.find((l) => l.response?.response && 'still_queued' in l.response.response).response.response)
}

const INTERRUPTED = '[Request interrupted by user]'
const INTERRUPTED_TOOL = '[Request interrupted by user for tool use]'
const REJECTED =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** The CLI's AskUserQuestion result, in the wording the extension's transcript reader parses (`RTe`, `aLt`, `rLt`). */
function answeredQuestionsText(input) {
  const answers = input?.answers ?? {}
  const pairs = (input?.questions ?? []).filter((q) => answers[q.question]).map((q) => `"${q.question}"="${answers[q.question]}"`)
  return `Your questions have been answered: ${pairs.join(', ')}. You can now continue with these answers in mind.`
}
/** Tools the CLI runs without asking, with the result it gives them. */
const NO_APPROVAL_RESULTS = {
  TodoWrite:
    'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable'
}
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
    this.promptSuggestions = false
    this.suggestionsPaused = false
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
    /** Background agents still working, by task id; they outlive the turn that started them. */
    this.background = new Map()
    this.pendingApprovals = new Map()
    this.counter = 0
    this.title = null
    this.bridgeSessionId = null
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

  /** The recorded reply; a script's `contextTokens` moves the difference between Messages and Free space. */
  contextUsage() {
    const reply = clone(recorded.context)
    reply.model = this.resolvedModel()
    const total = this.script.contextTokens
    if (typeof total !== 'number') return reply
    const extra = total - reply.totalTokens
    for (const category of reply.categories) {
      if (category.name === 'Messages') category.tokens += extra
      if (category.name === 'Free space') category.tokens -= extra
    }
    reply.totalTokens = total
    reply.percentage = Math.round((total / reply.maxTokens) * 100)
    return reply
  }

  /** A script's `title`, else the description's first five words, capitalised. */
  titleFor(description) {
    if (typeof this.script.title === 'string') return this.script.title
    const words = description.trim().split(/\s+/).slice(0, 5).join(' ')
    return words ? words[0].toUpperCase() + words.slice(1) : null
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
    const fail = (error) => this.send({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error } })
    const ok = (response) =>
      this.send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, ...(response ? { response } : {}) } })
    switch (request.subtype) {
      case 'initialize':
        this.promptSuggestions = request.promptSuggestions === true
        return ok({
          ...clone(recorded.initialize),
          account: accountFor(clone(recorded.initialize.account)),
          pid: process.pid,
          current_permission_mode: this.permissionMode,
          remote_control_auto_enable: this.script.remoteControlAtStartup === true,
          remote_control_available: this.script.remoteControlAvailable !== false
        })
      case 'remote_control':
        return this.remoteControl(request.enabled === true, ok, fail)
      case 'get_usage':
        return ok(clone(recorded.usage))
      case 'get_context_usage':
        return ok(this.contextUsage())
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
      case 'set_prompt_suggestions_paused':
        if (typeof request.paused !== 'boolean') return fail('Invalid set_prompt_suggestions_paused: paused must be a boolean')
        this.suggestionsPaused = request.paused
        return ok()
      case 'get_settings': {
        const reply = clone(template.settings)
        reply.effective = clone(this.flagSettings)
        reply.sources = Object.keys(this.flagSettings).length ? [{ source: 'flagSettings', settings: clone(this.flagSettings) }] : []
        reply.applied = { ...reply.applied, model: this.resolvedModel(), effort: this.effort }
        return ok(reply)
      }
      case 'generate_session_title': {
        if (typeof request.description !== 'string') return fail('generate_session_title: description must be a string')
        if (this.title === null || request.persist !== true) this.title = this.titleFor(request.description)
        const title = this.title
        return setTimeout(() => ok({ title }), this.script.titleDelayMs ?? 0)
      }
      case 'rename_session': {
        if (typeof request.title !== 'string') return fail('rename_session: title must be a string')
        if (request.session_id !== undefined && request.session_id !== this.sessionId) return fail('session_id is not the current session')
        this.title = request.title.trim()
        return ok()
      }
      case 'interrupt':
        return this.interrupt(request.cancel_queued === true, ok)
      case 'background_tasks': {
        const id = request.tool_use_id
        if (id !== undefined && id !== null && typeof id !== 'string') return fail('background_tasks: tool_use_id must be a string')
        const shell = this.running?.shell
        if (id === undefined || id === null || id === '') {
          ok({})
          return shell && !shell.backgrounded ? this.running.backgroundShell() : undefined
        }
        if (!shell || shell.toolUseId !== id || shell.backgrounded) return ok({ backgrounded: false })
        ok({ backgrounded: true })
        return this.running.backgroundShell()
      }
      case 'stop_task': {
        if (typeof request.task_id !== 'string') return fail('stop_task: task_id must be a string')
        const background = this.background.get(request.task_id)
        if (background) {
          ok()
          return background.stop()
        }
        const sub = this.running?.sub
        if (!sub || sub.taskId !== request.task_id || sub.stopped) return fail(`No running task with ID: ${request.task_id}`)
        ok()
        return this.running.stopSubagent()
      }
      default:
        return this.send({
          type: 'control_response',
          response: { subtype: 'error', request_id: requestId, error: recorded.unsupported.replace(/: .*$/, `: ${request.subtype}`) }
        })
    }
  }

  /** As the recorded probe: on sends `bridge_state` ready and the session links (the same ones while on); off always succeeds. */
  remoteControl(enabled, ok, fail) {
    if (!enabled) {
      this.bridgeSessionId = null
      return ok()
    }
    if (typeof this.script.remoteControlError === 'string') return fail(this.script.remoteControlError)
    if (!this.bridgeSessionId) {
      this.bridgeSessionId = `01Fake${randomBytes(9).toString('hex')}`
      this.send(this.stamp(clone(template.bridgeReady)))
    }
    const reply = clone(template.remoteControlReply)
    reply.session_url = `https://claude.ai/code/session_${this.bridgeSessionId}`
    reply.bridge_session_id = `cse_${this.bridgeSessionId}`
    return ok(reply)
  }

  /** As the CLI's receipt: a plain interrupt leaves queued prompts to run next; `cancel_queued` drops them. */
  interrupt(cancelQueued, ok) {
    const uuids = this.queue.flatMap((p) => (p.uuid ? [p.uuid] : []))
    const reply = clone(template.interruptReply)
    if (cancelQueued) {
      const cancelled = this.queue
      this.queue = []
      ok({ ...reply, still_queued: [], cancelled: uuids })
      for (const prompt of cancelled) this.lifecycle(prompt, 'cancelled')
    } else {
      ok({ ...reply, still_queued: uuids })
    }
    this.running?.abort()
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

  stopSubagent() {
    if (!this.sub) return
    this.sub.stopped = true
    for (const wake of this.wakers) wake()
  }

  backgroundShell() {
    if (!this.shell) return
    this.shell.backgrounded = true
    for (const wake of this.wakers) wake()
  }

  get halted() {
    return this.aborted || this.sub?.stopped === true
  }

  sleep(ms) {
    if (!ms || this.halted) return Promise.resolve()
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
    const stamped = this.fake.stamp(line)
    if (this.sub && 'parent_tool_use_id' in stamped) {
      stamped.parent_tool_use_id = this.sub.toolUseId
      this.sub.record(stamped)
    }
    this.fake.send(stamped)
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
      if (this.halted) return false
      await this.sleep(event.delayMs)
      if (this.halted) return false
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
        case 'subagent':
          await this.subagent(event)
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

  endMessage(stopReason, index = 0) {
    this.stream(this.at(clone(template.blockStop), index))
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

  /** Sets a stream line's block index. */
  at(line, index) {
    line.event.index = index
    return line
  }

  /** A thinking block at index 0, as the real CLI streams it: tokens estimates and empty thinking deltas, then the signature. */
  async thinkingBlock(messageId, thinking) {
    const spec = typeof thinking === 'object' && thinking !== null ? thinking : {}
    this.stream(this.at(clone(template.thinkingBlockStart), 0))
    const text = typeof spec.text === 'string' ? spec.text : ''
    const pieces = text ? chunk(text) : ['']
    const tokens = spec.tokens ?? 50
    const step = (spec.ms ?? 0) / pieces.length
    for (const [i, piece] of pieces.entries()) {
      const estimate = Math.round((tokens * (i + 1)) / pieces.length)
      const sys = clone(template.thinkingTokens)
      sys.estimated_tokens = estimate
      sys.estimated_tokens_delta = Math.round(tokens / pieces.length)
      this.emit(sys)
      const delta = this.at(clone(template.thinkingDelta), 0)
      delta.event.delta.thinking = piece
      delta.event.delta.estimated_tokens = estimate
      this.stream(delta)
      await this.sleep(step)
      if (this.aborted) return
    }
    this.stream(this.at(clone(template.signatureDelta), 0))
    const block = clone(template.thinkingAssistant.message.content[0])
    block.thinking = text
    this.emit(this.assistant(messageId, block))
    this.stream(this.at(clone(template.blockStop), 0))
  }

  async text(event) {
    const messageId = this.fake.id('msg_fake')
    this.startMessage(messageId)
    let index = 0
    if (event.thinking) {
      await this.thinkingBlock(messageId, event.thinking)
      if (this.aborted) return
      index = 1
    }
    this.stream(this.at(clone(template.textBlockStart), index))
    let sent = ''
    for (const piece of event.deltas ?? chunk(event.text ?? '')) {
      await this.sleep(event.deltaDelayMs ?? this.script.deltaDelayMs)
      if (this.aborted) return
      const delta = this.at(clone(template.textDelta), index)
      delta.event.delta.text = piece
      this.stream(delta)
      sent += piece
    }
    this.lastText = event.text ?? sent
    this.emit(this.assistant(messageId, { type: 'text', text: this.lastText }))
    this.endMessage('end_turn', index)
  }

  /** An assistant message holding one tool call, streamed as the CLI does; returns its tool_use id. */
  callMessage(name, input) {
    const messageId = this.fake.id('msg_fake')
    const toolUseId = this.fake.id('toolu_fake')
    this.startMessage(messageId)
    const blockStart = this.at(clone(template.toolBlockStart), 0)
    blockStart.event.content_block.id = toolUseId
    blockStart.event.content_block.name = name
    this.stream(blockStart)
    const delta = this.at(clone(template.inputDelta), 0)
    delta.event.delta.partial_json = JSON.stringify(input)
    this.stream(delta)
    const block = { ...clone(template.assistant.message.content[0]), type: 'tool_use', id: toolUseId, name, input }
    const assistant = this.assistant(messageId, block)
    delete assistant.wire_tool_inputs
    this.emit(assistant)
    this.endMessage('tool_use', 0)
    this.numTurns++
    return toolUseId
  }

  /**
   * An Agent call and its subagent's turn, shaped by the CLI's schema: `task_started`, the subagent's lines with
   * `parent_tool_use_id` set to the call, a `task_progress` after each of its events, `task_notification`, then the call's result.
   * With `CLAUDE_CONFIG_DIR` set the subagent's own transcript is written beside the session's, as the CLI does.
   */
  async subagent(event) {
    const fake = this.fake
    const input = { description: event.description ?? 'Subagent', prompt: event.prompt ?? '', subagent_type: event.subagentType ?? 'general-purpose' }
    const toolUseId = this.callMessage('Agent', input)
    const taskId = `a${randomBytes(8).toString('hex')}`
    const background = event.background === true
    const system = (fields) => this.emit({ type: 'system', ...fields, task_id: taskId, tool_use_id: toolUseId, uuid: '', session_id: '' })
    system({
      subtype: 'task_started',
      description: input.description,
      subagent_type: input.subagent_type,
      task_type: 'local_agent',
      prompt: input.prompt,
      is_backgrounded: background
    })
    if (background) this.toolResult(toolUseId, `Async agent launched successfully.\nagentId: ${taskId}`, false)
    const transcript = subagentTranscript(fake.sessionId, taskId, toolUseId, input)
    if (background) {
      transcript.record({ type: 'user', message: { role: 'user', content: input.prompt } })
      const steps = Array.from({ length: event.loop ?? 1 }, () => event.events ?? []).flat()
      void runBackgroundAgent(fake, { taskId, toolUseId, description: input.description, record: transcript.record }, steps, event.result ?? 'Done.', system)
      return
    }
    const sub = { taskId, toolUseId, stopped: false, record: transcript.record }
    transcript.record({ type: 'user', message: { role: 'user', content: input.prompt } })
    const started = Date.now()
    let toolUses = 0
    let tokens = 0
    const usage = () => ({ total_tokens: tokens, tool_uses: toolUses, duration_ms: Date.now() - started })
    const mainText = this.lastText
    this.sub = sub
    for (const child of event.events ?? []) {
      if (this.halted) break
      await this.play([child])
      if (this.halted) break
      if (child.type === 'tool_use') toolUses++
      tokens += 1500
      this.sub = null
      system({ subtype: 'task_progress', description: input.description, usage: usage(), ...(child.type === 'tool_use' ? { last_tool_name: child.name } : {}) })
      this.sub = sub
    }
    this.sub = null
    this.lastText = mainText
    if (this.aborted) return
    const stopped = sub.stopped
    const summary = stopped ? '' : (event.result ?? 'Done.')
    system({ subtype: 'task_notification', status: stopped ? 'stopped' : 'completed', output_file: '', summary, usage: usage() })
    if (background) return
    if (stopped) this.toolResult(toolUseId, INTERRUPTED_TOOL, true)
    else this.userMessage([{ tool_use_id: toolUseId, type: 'tool_result', content: [{ type: 'text', text: summary }, { type: 'text', text: `agentId: ${taskId}` }] }])
  }

  /** True when the tool call ended the turn. */
  async toolUse(event) {
    const fake = this.fake
    const messageId = fake.id('msg_fake')
    const toolUseId = fake.id('toolu_fake')
    const input = event.input ?? {}
    this.startMessage(messageId)
    let index = 0
    if (event.thinking) {
      await this.thinkingBlock(messageId, event.thinking)
      if (this.aborted) return false
      index = 1
    }
    const blockStart = this.at(clone(template.toolBlockStart), index)
    blockStart.event.content_block.id = toolUseId
    blockStart.event.content_block.name = event.name
    this.stream(blockStart)
    const delta = this.at(clone(template.inputDelta), index)
    delta.event.delta.partial_json = JSON.stringify(input)
    this.stream(delta)
    const block = { ...clone(template.assistant.message.content[0]), type: 'tool_use', id: toolUseId, name: event.name, input }
    const assistant = this.assistant(messageId, block)
    delete assistant.wire_tool_inputs
    this.emit(assistant)
    this.endMessage('tool_use', index)
    this.numTurns++

    let decision = { behavior: 'allow', updatedInput: input }
    const asks = event.approval ?? !(event.name in NO_APPROVAL_RESULTS)
    if (asks !== false && !fake.autoAllowed(event.name)) {
      decision = await this.ask(event, toolUseId, input)
      if (this.aborted) return false
    }
    if (decision.behavior === 'allow') {
      fake.remember(decision.updatedPermissions)
      if (typeof event.runMs === 'number') {
        if (!(await this.runShell(event, toolUseId, input))) return false
        this.foldQueued()
        return false
      }
      const answered = event.name === 'AskUserQuestion' ? answeredQuestionsText(decision.updatedInput) : undefined
      this.toolResult(toolUseId, event.result ?? answered ?? NO_APPROVAL_RESULTS[event.name] ?? 'Done.', false)
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

  /**
   * A shell command that runs `runMs` in the foreground, shaped by the CLI's schema: `task_started` (`local_bash`, not backgrounded),
   * then `task_updated` and the call's result. `background_tasks` for its call moves it to the background at once. False when interrupted.
   */
  async runShell(event, toolUseId, input) {
    const taskId = `b${randomBytes(4).toString('hex')}`
    const system = (fields) => this.emit({ type: 'system', ...fields, task_id: taskId, uuid: '', session_id: '' })
    system({ subtype: 'task_started', tool_use_id: toolUseId, description: input.description ?? input.command ?? event.name, task_type: 'local_bash', is_backgrounded: false })
    this.shell = { taskId, toolUseId, backgrounded: false }
    this.awaitingTool = toolUseId
    await this.sleep(event.runMs)
    const shell = this.shell
    this.shell = null
    if (this.aborted) return false
    this.awaitingTool = null
    if (shell.backgrounded) {
      system({ subtype: 'task_updated', patch: { is_backgrounded: true } })
      const output = join(process.cwd(), '.fake-claude', 'tasks', `${taskId}.output`)
      this.toolResult(toolUseId, `Command was manually backgrounded by user with ID: ${taskId}. Output is being written to: ${output}`, false)
      return true
    }
    system({ subtype: 'task_updated', patch: { status: 'completed', end_time: Date.now() } })
    this.toolResult(toolUseId, event.result ?? 'Done.', false)
    return true
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
    if (this.fake.promptSuggestions && !this.fake.suggestionsPaused && typeof this.script.suggestion === 'string') {
      this.emit({ type: 'prompt_suggestion', suggestion: this.script.suggestion, uuid: '', session_id: '' })
    }
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

/**
 * A background agent, which outlives the turn: each event goes out with `parent_tool_use_id` and into its own file, a `task_progress`
 * after each, then `task_notification` (`completed`, or `stopped` after `stop_task`). Events: `text`, `tool_use` (`result`) and `wait`.
 */
async function runBackgroundAgent(fake, agent, events, result, system) {
  let wake = null
  const state = { stopped: false }
  fake.background.set(agent.taskId, {
    stop() {
      state.stopped = true
      wake?.()
    }
  })
  const sleep = (ms) =>
    !ms || state.stopped
      ? Promise.resolve()
      : new Promise((resolve) => {
          const done = () => {
            clearTimeout(timer)
            wake = null
            resolve()
          }
          const timer = setTimeout(done, ms)
          wake = done
        })
  const out = (line) => {
    const stamped = fake.stamp(line)
    stamped.parent_tool_use_id = agent.toolUseId
    agent.record(stamped)
    fake.send(stamped)
  }
  const assistant = (block) => {
    const line = clone(template.assistant)
    line.message.id = fake.id('msg_fake')
    line.message.model = fake.resolvedModel()
    line.message.content = [block]
    line.request_id = fake.id('req_fake')
    delete line.wire_tool_inputs
    return line
  }
  const started = Date.now()
  let toolUses = 0
  let tokens = 0
  const usage = () => ({ total_tokens: tokens, tool_uses: toolUses, duration_ms: Date.now() - started })
  for (const raw of events) {
    const event = fill(raw)
    await sleep(event.delayMs)
    if (state.stopped) break
    if (event.type === 'wait') {
      await sleep(event.ms)
      continue
    }
    if (event.type === 'text') out(assistant({ type: 'text', text: event.text ?? '' }))
    else if (event.type === 'tool_use') {
      const id = fake.id('toolu_fake')
      out(assistant({ ...clone(template.assistant.message.content[0]), type: 'tool_use', id, name: event.name, input: event.input ?? {} }))
      const line = clone(template.toolResult)
      line.message.content = [{ tool_use_id: id, type: 'tool_result', content: event.result ?? 'Done.' }]
      delete line.tool_use_result
      delete line.tool_result_meta
      out(line)
      toolUses++
    } else throw new Error(`fake-claude: background agents do not play ${event.type}`)
    tokens += 1500
    system({ subtype: 'task_progress', description: agent.description, usage: usage(), ...(event.type === 'tool_use' ? { last_tool_name: event.name } : {}) })
  }
  fake.background.delete(agent.taskId)
  system({ subtype: 'task_notification', status: state.stopped ? 'stopped' : 'completed', output_file: '', summary: state.stopped ? '' : result, usage: usage() })
}

/** The CLI keeps a subagent's lines in `projects/<cwd>/<session>/subagents/agent-<id>.jsonl`, with a `.meta.json` naming its call. */
function subagentTranscript(sessionId, agentId, toolUseId, input) {
  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (!configDir) return { record: () => {} }
  const dir = join(configDir, 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'), sessionId, 'subagents')
  const file = join(dir, `agent-${agentId}.jsonl`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `agent-${agentId}.meta.json`), JSON.stringify({ agentType: input.subagent_type, description: input.description, toolUseId }))
  writeFileSync(file, '')
  return {
    record(line) {
      if (line.type !== 'user' && line.type !== 'assistant') return
      const entry = { isSidechain: true, agentId, type: line.type, uuid: randomUUID(), timestamp: new Date().toISOString(), message: line.message }
      appendFileSync(file, JSON.stringify(entry) + '\n')
    }
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
