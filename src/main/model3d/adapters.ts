import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { existsSync, openSync, closeSync, watch } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { childEnv } from '../util/childEnv'
import { progressStep, watchComfyMessages } from './comfyWs'
import type { Model3dConfig } from './config'
import { SERVICE_FILE, writeJsonAtomic } from './jobsFolder'
import { COORD_JOB, type ComfyClient, type CoordBoard, type CoordClaim, type Model3dClock, type Model3dPorts, type ProcessList, type ServerLauncher, type WorkerRunner } from './service'

const KILL_LIMIT_MS = 5000
const HTTP_TIMEOUT_MS = 3000

export interface ExecResult {
  code: number | null
  stdout: string
}
export type Exec = (command: string, args: string[]) => Promise<ExecResult>

const exec: Exec = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 30_000 }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : null) : 0
      resolve({ code, stdout: String(stdout ?? '') })
    })
  })

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

/** The coord board through `python -I coord.py`; every call is skipped while the script is missing. */
export function createCoordBoard(script: string, run: Exec = exec, python = 'python'): CoordBoard {
  const call = (...args: string[]): Promise<ExecResult> | null => (existsSync(script) ? run(python, ['-I', script, ...args]) : null)
  return {
    async claims() {
      const result = await call('claims', 'gpu')
      return result ? parseCoordClaims(result.stdout) : []
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
    free: () => post('/free', { unload_models: true, free_memory: true })
  }
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
    async stopOutside() {
      const { stdout } = await exec('netstat', ['-ano', '-p', 'TCP'])
      for (const pid of listenerPids(stdout, config.port)) await exec('taskkill', ['/PID', String(pid), '/T', '/F'])
    }
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

const processList: ProcessList = {
  async list() {
    const { stdout } = await exec('tasklist', ['/FO', 'CSV', '/NH'])
    return stdout
      .split(/\r?\n/)
      .map((line) => /^"([^"]+)"/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined)
  },
  alive: async (pid) => pidAlive(pid)
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

/** The real outside world: tasklist, coord.py, ComfyUI3D over HTTP and `/ws`, child processes and the browser (`openExternal`). */
export function realModel3dPorts(config: Model3dConfig, openExternal: (url: string) => Promise<void>): Model3dPorts {
  const editorUrl = `http://127.0.0.1:${config.port}`
  return {
    clock,
    processes: processList,
    coord: createCoordBoard(config.coordScript),
    comfy: comfyClient(config.port),
    server: serverLauncher(config),
    workers: workerRunner,
    watchFolder,
    writeServiceFile: (file) => writeJsonAtomic(join(config.folder, SERVICE_FILE), file),
    openEditor: () => (config.browserLog ? appendFile(config.browserLog, `${editorUrl}\n`): openExternal(editorUrl))
  }
}
