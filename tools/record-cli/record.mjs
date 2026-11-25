// Run: node tools/record-cli/record.mjs <workspace dir> <raw output .jsonl> <script .json>
// Records one real CLI turn over stream-json, plus timed control requests after its first result. See README.md.
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [workspace, outPath, scriptPath] = process.argv.slice(2)
if (!workspace || !outPath || !scriptPath) {
  console.error('usage: node tools/record-cli/record.mjs <workspace dir> <raw output .jsonl> <script .json>')
  process.exit(2)
}
const script = JSON.parse(readFileSync(scriptPath, 'utf-8'))
if (typeof script.prompt !== 'string') throw new Error('script: "prompt" must be a string')
const model = script.model ?? 'haiku'
const afterResult = script.afterResult ?? []
const endAfterMs = script.endAfterMs ?? Math.max(0, ...afterResult.map((c) => c.atMs)) + 2500
const killAfterMs = script.killAfterMs ?? 120_000

writeFileSync(outPath, '')
const log = (direction, line) => appendFileSync(outPath, JSON.stringify({ direction, at: Date.now(), line }) + '\n')

const args = [
  '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
  '--replay-user-messages', '--permission-prompt-tool=stdio', '--setting-sources', 'user,project,local',
  '--model', model, '--no-session-persistence', ...(script.extraArgs ?? [])
]
const bin = process.env.CC_CLAUDE_BIN
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = bin
  ? spawn(process.execPath, [resolve(bin), ...args], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'], env })
  : spawn('claude', args, { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'], env, shell: process.platform === 'win32' })

function processTable() {
  if (process.platform === 'win32') {
    const json = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(json).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, command: p.CommandLine ?? '' }))
  }
  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }))
}

function descendants(rootPid) {
  const table = processTable()
  const found = []
  const walk = (pid) => table.filter((p) => p.ppid === pid && p.pid !== pid).forEach((p) => (found.push(p), walk(p.pid)))
  walk(rootPid)
  return found
}

let spawned = []
const snapshot = () => {
  try {
    const now = descendants(child.pid)
    spawned = [...spawned, ...now.filter((p) => !spawned.some((s) => s.pid === p.pid))]
  } catch (error) {
    console.error('record-cli: could not list child processes:', error.message)
  }
}

let requestCount = 0
const send = (line) => {
  log('host', line)
  child.stdin.write(JSON.stringify(line) + '\n')
}
const control = (subtype, fields = {}) => send({ type: 'control_request', request_id: `r${++requestCount}`, request: { subtype, ...fields } })

let taskId = null
let resultSeen = false
const openTasks = new Map()
const fill = (value) =>
  typeof value === 'string'
    ? value.replaceAll('{task_id}', taskId ?? '')
    : Array.isArray(value)
      ? value.map(fill)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]))
        : value

const onLine = (line) => {
  log('cli', line)
  if (line.type !== 'stream_event') console.log(`${line.type}/${line.subtype ?? line.response?.subtype ?? line.request?.subtype ?? ''}`)
  if (line.type === 'control_request' && line.request?.subtype === 'can_use_tool') {
    send({ type: 'control_response', response: { subtype: 'success', request_id: line.request_id, response: { behavior: 'allow', updatedInput: line.request.input } } })
  }
  if (line.type === 'system' && line.subtype === 'task_started') {
    openTasks.set(line.task_id, line.description ?? line.task_type)
    if (line.task_type === 'local_bash' && !taskId) taskId = line.task_id
  }
  if (line.type === 'system' && line.subtype === 'task_notification') openTasks.delete(line.task_id)
  if (line.type === 'result' && !resultSeen) {
    resultSeen = true
    for (const { atMs, subtype, fields } of afterResult) {
      setTimeout(() => {
        if (fields && JSON.stringify(fields).includes('{task_id}') && !taskId) console.error(`record-cli: ${subtype} wants {task_id}, but no local_bash task started`)
        control(subtype, fill(fields ?? {}))
      }, atMs)
    }
    setTimeout(() => {
      snapshot()
      child.stdin.end()
    }, endAfterMs)
  }
}

let buffer = ''
child.stdout.setEncoding('utf-8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  let i
  while ((i = buffer.indexOf('\n')) !== -1) {
    const text = buffer.slice(0, i).trim()
    buffer = buffer.slice(i + 1)
    if (!text) continue
    let line
    try {
      line = JSON.parse(text)
    } catch {
      console.log('raw', text)
      continue
    }
    onLine(line)
  }
})
child.stderr.on('data', (d) => process.stderr.write(`[cli stderr] ${d}`))

const hardKill = setTimeout(() => {
  console.error(`record-cli: no exit after ${killAfterMs} ms; killing the CLI's process tree`)
  snapshot()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}, killAfterMs)
const snapshots = setInterval(snapshot, 2000)

child.on('exit', (code) => {
  clearTimeout(hardKill)
  clearInterval(snapshots)
  console.log(`record-cli: CLI exited with ${code}; raw log in ${outPath}`)
  for (const [id, what] of openTasks) console.warn(`record-cli: task ${id} (${what}) never sent task_notification`)
  setTimeout(() => {
    let alive = []
    try {
      const pids = new Set(processTable().map((p) => p.pid))
      alive = spawned.filter((p) => pids.has(p.pid))
    } catch (error) {
      console.error('record-cli: could not check for leftovers:', error.message)
    }
    for (const p of alive) console.warn(`record-cli: LEFTOVER pid ${p.pid}: ${p.command}`)
    if (alive.length === 0) console.log('record-cli: no leftover processes')
    process.exit(alive.length > 0 ? 3 : 0)
  }, 500)
})

control('initialize', { hooks: null })
setTimeout(() => {
  send({
    type: 'user',
    uuid: script.uuid ?? '11111111-1111-4111-8111-111111111111',
    message: { role: 'user', content: [{ type: 'text', text: script.prompt }] }
  })
}, 500)
