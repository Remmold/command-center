import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { appendFile, realpath, stat } from 'node:fs/promises'
import { existsSync, openSync, closeSync, watch } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { Model3dRequest } from '../../shared/model3d'
import { childEnv } from '../util/childEnv'
import { progressStep, watchComfyMessages } from './comfyWs'
import type { Model3dConfig } from './config'
import { SERVICE_FILE, diskJobsFolder, writeJsonAtomic } from './jobsFolder'
import { COORD_JOB, type ComfyClient, type CoordBoard, type CoordClaim, type Model3dClock, type Model3dPorts, type ProcessList, type ServerLauncher, type WorkerRunner } from './service'

const KILL_LIMIT_MS = 5000
const HTTP_TIMEOUT_MS = 3000

export interface ExecResult {
  code: number | null
  stdout: string
  stderr?: string
  /** Why the command did not run at all, e.g. `spawn python ENOENT`. */
  error?: string
}
export type Exec = (command: string, args: string[]) => Promise<ExecResult>

const EXEC_LIMIT_MS = 30_000

const exec: Exec = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: EXEC_LIMIT_MS }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : null) : 0
      const result: ExecResult = { code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
      if (err && code === null) result.error = err.killed ? `${command} did not answer within ${EXEC_LIMIT_MS / 1000} s` : err.message
      resolve(result)
    })
  })

/** What went wrong in a run that did not end 0: the spawn error, else stderr's first line, else the exit code. */
function failure(result: ExecResult): string {
  const line = (result.stderr ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean)
  return result.error ?? line ?? `exit code ${result.code ?? 'unknown'}`
}

/** Stops a process and its children, and resolves once taskkill is done or after a limit. */
function killTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.pid === undefined) return resolve()
    const timer = setTimeout(resolve, KILL_LIMIT_MS)
    const done = (): void => {
      clearTimeout(timer)
      resolve()
    }
    child.once('exit', done)
    const taskkill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    taskkill.on('error', () => child.kill())
  })
}

/** `claims gpu` prints `2026-11-28 10:27:45Z  {"job": …, "path": "gpu", "why": …}` per claim. */
export function parseCoordClaims(stdout: string): CoordClaim[] {
  const claims: CoordClaim[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const brace = line.indexOf('{')
    if (brace < 0) continue
    let data: { job?: unknown; path?: unknown; why?: unknown }
    try {
      data = JSON.parse(line.slice(brace)) as typeof data
    } catch {
      continue
    }
    if (typeof data.job !== 'string' || typeof data.path !== 'string' || data.path.toLowerCase() !== 'gpu') continue
    const since = Date.parse(line.slice(0, brace).trim().replace(' ', 'T'))
    claims.push({ job: data.job, since: Number.isNaN(since) ? 0 : since, why: typeof data.why === 'string' ? data.why : '' })
  }
  return claims
}

/** The engine venv's python runs coord.py when it is there: `python` on PATH may be missing or the WindowsApps stub. */
export function coordPython(enginePython: string): string {
  return existsSync(enginePython) ? enginePython : 'python'
}

/** The coord board through `python -I coord.py`; every call is skipped while the script is missing. */
export function createCoordBoard(script: string, run: Exec = exec, python = 'python'): CoordBoard {
  const call = (...args: string[]): Promise<ExecResult> | null => (existsSync(script) ? run(python, ['-I', script, ...args]) : null)
  return {
    async claims() {
      const result = await call('claims', 'gpu')
      if (!result) return { ok: true, claims: [] }
      return result.code === 0 ? { ok: true, claims: parseCoordClaims(result.stdout) } : { ok: false, error: failure(result) }
    },
    async claim() {
      const result = await call('claim', COORD_JOB, 'gpu', 'Command Center 3D server')
      return result ? result.code === 0 : true
    },
    async unclaim() {
      await call('unclaim', COORD_JOB, 'gpu')
    }
  }
}

/** The pids listening on `port` in `netstat -ano -p TCP` output (IPv4 and IPv6 rows), each once. */
export function listenerPids(stdout: string, port: number): number[] {
  const pids = new Set<number>()
  for (const line of stdout.split(/\r?\n/)) {
    const [proto, local, , state, pid] = line.trim().split(/\s+/)
    if (proto !== 'TCP' || state !== 'LISTENING' || !local?.endsWith(`:${port}`)) continue
    const n = Number(pid)
    if (Number.isInteger(n) && n > 0) pids.add(n)
  }
  return [...pids]
}

function comfyClient(port: number): ComfyClient {
  const url = (path: string): string => `http://127.0.0.1:${port}${path}`
  const post = async (path: string, body?: unknown): Promise<void> => {
    await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    }).catch(() => undefined)
  }
  return {
    async up() {
      try {
        return (await fetch(url('/system_stats'), { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })).ok
      } catch {
        return false
      }
    },
    watchProgress(clientId, onStep) {
      return watchComfyMessages(port, clientId, (message) => {
        const step = progressStep(message)
        if (step) onStep(step.step, step.steps)
      })
    },
    interrupt: () => post('/interrupt'),
    clearQueue: () => post('/queue', { clear: true }),
    async busy() {
      try {
        const res = await fetch(url('/queue'), { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
        if (!res.ok) return false
        const q = (await res.json()) as { queue_running?: unknown; queue_pending?: unknown }
        return (Array.isArray(q.queue_running) && q.queue_running.length > 0) || (Array.isArray(q.queue_pending) && q.queue_pending.length > 0)
      } catch {
        return false
      }
    },
    free: () => post('/free', { unload_models: true, free_memory: true })
  }
}

interface ProcessRow {
  ProcessId?: unknown
  Name?: unknown
  CommandLine?: unknown
}

/** ComfyUI's own process: a python*.exe running main.py. */
const isComfy = (row: ProcessRow): boolean =>
  typeof row.Name === 'string' && /^python[^\\/]*\.exe$/i.test(row.Name) && typeof row.CommandLine === 'string' && /(^|[\\/\s"])main\.py\b/i.test(row.CommandLine)

/** Stops what listens on `port` (IPv4 and IPv6), but only ComfyUI's python processes and their trees; anything else is left alone. */
export async function stopOutsideServer(port: number, run: Exec = exec): Promise<void> {
  const pids = listenerPids((await run('netstat', ['-ano'])).stdout, port)
  if (pids.length === 0) return
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' or ')
  const listed = await run('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Get-CimInstance Win32_Process -Filter '${filter}' | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`
  ])
  if (listed.code !== 0) return
  let rows: ProcessRow[]
  try {
    const parsed = JSON.parse(listed.stdout) as ProcessRow | ProcessRow[]
    rows = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return
  }
  for (const row of rows) {
    if (isComfy(row) && typeof row.ProcessId === 'number' && pids.includes(row.ProcessId)) await run('taskkill', ['/PID', String(row.ProcessId), '/T', '/F'])
  }
}

/** The folders a request's `script` may be in: the model3d skill of the home account and of each account profile, and the one e2e names. */
export function model3dScriptDirs(home: string, configDirs: readonly string[], extra: string | null): string[] {
  const dirs = [join(home, '.claude'), ...configDirs].map((d) => join(d, 'skills', 'model3d', 'scripts'))
  const key = (d: string): string => resolve(d).toLowerCase()
  const unique = dirs.filter((d, i) => dirs.findIndex((o) => key(o) === key(d)) === i)
  return extra ? [...unique, extra] : unique
}

const PATH_PYTHON = /^(python[0-9.]*|py)(\.exe)?$/i
const PYTHON_EXE = /^python[^\\/]*\.exe$/i

const real = (p: string): Promise<string | null> => realpath(p).then((r) => r.toLowerCase(), () => null)

/** Why the worker a generate request names may not run, or null: the skill's gen3d.py, a python, an existing folder. */
export async function vetWorkerRequest(request: Pick<Model3dRequest, 'script' | 'python' | 'cwd'>, scriptDirs: readonly string[]): Promise<string | null> {
  const script = isAbsolute(request.script) ? await real(request.script) : null
  const dirs = await Promise.all(scriptDirs.map(real))
  if (!script || basename(script) !== 'gen3d.py' || !dirs.includes(dirname(script))) return 'script is not gen3d.py in a model3d skill folder'
  const python = request.python
  const onPath = PATH_PYTHON.test(python)
  const pythonOk = onPath || (isAbsolute(python) && PYTHON_EXE.test(basename(python)) && (await stat(python).then((s) => s.isFile(), () => false)))
  if (!pythonOk) return 'python is not a python*.exe that exists, nor python or py on PATH'
  if (!isAbsolute(request.cwd) || !(await stat(request.cwd).then((s) => s.isDirectory(), () => false))) return 'cwd is not a folder that exists'
  return null
}

function serverLauncher(config: Model3dConfig): ServerLauncher {
  return {
    async start() {
      const log = openSync(config.serverLog, 'w')
      let child: ChildProcess
      try {
        child = spawn(config.enginePython, ['main.py', '--port', String(config.port)], {
          cwd: config.engineDir,
          stdio: ['ignore', log, log],
          env: childEnv(process.env),
          windowsHide: true
        })
      } finally {
        closeSync(log)
      }
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      return {
        stop: () => killTree(child),
        onExit: (cb) => {
          if (child.exitCode !== null) cb()
          else child.once('exit', () => cb())
        }
      }
    },
    stopOutside: () => stopOutsideServer(config.port)
  }
}

const workerRunner: WorkerRunner = {
  run(spec, events) {
    const child = spawn(spec.python, spec.args, {
      cwd: spec.cwd,
      env: childEnv(process.env, { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', CC_MODEL3D_CLIENT_ID: spec.clientId }),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let ended = false
    const closedStreams = new Promise<void>((resolve) => {
      let open = 2
      for (const name of ['stdout', 'stderr'] as const) {
        const stream = child[name]
        if (!stream) {
          if (--open === 0) resolve()
          continue
        }
        const rl = createInterface({ input: stream })
        rl.on('line', (line) => events[name](line))
        rl.on('close', () => {
          if (--open === 0) resolve()
        })
      }
    })
    const finish = (code: number | null): void => {
      if (ended) return
      ended = true
      void closedStreams.then(() => events.exit(code))
    }
    child.once('error', (err) => {
      events.stderr(`The worker could not start: ${err.message}`)
      finish(null)
    })
    child.once('exit', (code) => finish(code))
    return { kill: () => killTree(child) }
  }
}

/** Signal 0 only asks; a process of another user answers EPERM and is alive too. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The running processes through `tasklist`; a run that fails or is cut off rejects, as its list may miss the cluster or Unity. */
export function createProcessList(run: Exec = exec): ProcessList {
  return {
    async list() {
      const result = await run('tasklist', ['/FO', 'CSV', '/NH'])
      if (result.code !== 0) throw new Error(failure(result))
      return result.stdout
        .split(/\r?\n/)
        .map((line) => /^"([^"]+)"/.exec(line)?.[1])
        .filter((name): name is string => name !== undefined)
    },
    alive: async (pid) => pidAlive(pid)
  }
}

const clock: Model3dClock = {
  now: () => Date.now(),
  localTime: (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  every: (ms, fn) => {
    const timer = setInterval(fn, ms)
    return () => clearInterval(timer)
  },
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  }
}

function watchFolder(folder: string, onChange: () => void): () => void {
  try {
    // Only a new request matters at once; the app's own status and heartbeat writes would only wake the scan.
    const watcher = watch(folder, (_event, name) => {
      if (!name || String(name).endsWith('.request.json')) onChange()
    })
    watcher.on('error', () => undefined)
    return () => watcher.close()
  } catch {
    return () => undefined
  }
}

/**
 * The real outside world: tasklist, coord.py, ComfyUI3D over HTTP and `/ws`, child processes, the jobs folder and the
 * browser (`openExternal`). `scriptDirs` names the folders a request's gen3d.py may be in, read again for each request.
 */
export function realModel3dPorts(config: Model3dConfig, openExternal: (url: string) => Promise<void>, scriptDirs: () => Promise<string[]> = async () => []): Model3dPorts {
  const editorUrl = `http://127.0.0.1:${config.port}`
  return {
    clock,
    processes: createProcessList(),
    coord: createCoordBoard(config.coordScript, exec, coordPython(config.enginePython)),
    jobs: diskJobsFolder(config.folder),
    vetRequest: async (request) => vetWorkerRequest(request, await scriptDirs()),
    comfy: comfyClient(config.port),
    server: serverLauncher(config),
    workers: workerRunner,
    watchFolder,
    writeServiceFile: (file) => writeJsonAtomic(join(config.folder, SERVICE_FILE), file),
    openEditor: () => (config.browserLog ? appendFile(config.browserLog, `${editorUrl}\n`): openExternal(editorUrl))
  }
}
