import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import {
  parseModel3dRequest,
  type Model3dJob,
  type Model3dJobState,
  type Model3dProgress,
  type Model3dRequest,
  type Model3dServerState,
  type Model3dServiceFile,
  type Model3dStatus,
  type Model3dView
} from '../../shared/model3d'
import { listJobFiles, readJson, removeJobFiles, requestFile, SERVICE_FILE, statusFile, writeJsonAtomic } from './jobsFolder'
import { progressMarker, workerError, workerOutputs } from './workerOutput'
import { join } from 'node:path'

/** The app's job name on the coord board. */
export const COORD_JOB = 'command-center-3d'
export const HEARTBEAT_MS = 5_000
export const CHECK_MS = 5_000
export const IDLE_STOP_MS = 10 * 60_000
export const READY_TIMEOUT_MS = 120_000
export const READY_POLL_MS = 1_000
export const HISTORY_KEEP = 50
export const CANCELLED_APP_CLOSED = 'Cancelled: app closed'
const CLAIM_REFUSED = 'Waiting: the coord board refused the gpu claim'
const STDERR_KEEP = 200

export interface Model3dClock {
  now(): number
  /** `HH:MM` in the user's time zone. */
  localTime(ms: number): string
  every(ms: number, fn: () => void): () => void
  after(ms: number, fn: () => void): () => void
}

export interface CoordClaim {
  job: string
  /** Epoch ms. */
  since: number
  why: string
}

/** The coord board's `gpu` claims; a board whose script is missing has none and takes every claim. */
export interface CoordBoard {
  claims(): Promise<CoordClaim[]>
  /** False when another job holds `gpu`. */
  claim(): Promise<boolean>
  unclaim(): Promise<void>
}

export interface ComfyClient {
  /** Whether `/system_stats` answers. */
  up(): Promise<boolean>
  /** The sampling step of prompts queued under `clientId`, from `/ws`; returns the stop. */
  watchProgress(clientId: string, onStep: (step: number, steps: number) => void): () => void
  interrupt(): Promise<void>
  clearQueue(): Promise<void>
  free(): Promise<void>
}

export interface ServerProcess {
  /** Stops the server's whole process tree. */
  stop(): Promise<void>
  onExit(cb: () => void): void
}

export interface ServerLauncher {
  start(): Promise<ServerProcess>
}

export interface WorkerSpec {
  python: string
  args: string[]
  cwd: string
  /** The ComfyUI client id the worker queues its prompts under, so `/ws` progress reaches the app. */
  clientId: string
}

export interface WorkerEvents {
  stdout(line: string): void
  stderr(line: string): void
  exit(code: number | null): void
}

export interface WorkerProcess {
  /** Stops the worker's whole process tree. */
  kill(): Promise<void>
}

export interface WorkerRunner {
  run(spec: WorkerSpec, events: WorkerEvents): WorkerProcess
}

export interface ProcessList {
  /** The image names of the running processes, e.g. `Unity.exe`. */
  list(): Promise<string[]>
}

export interface Model3dPorts {
  clock: Model3dClock
  processes: ProcessList
  coord: CoordBoard
  comfy: ComfyClient
  server: ServerLauncher
  workers: WorkerRunner
  /** Calls back when something in the folder changes; returns the stop. The 5 s scan runs either way. */
  watchFolder(folder: string, onChange: () => void): () => void
}

export interface Model3dServiceConfig {
  folder: string
  /** Written to service.json, so gen3d.py can tell the app is alive. */
  pid: number
  clusterProcesses: readonly string[]
  unityProcesses: readonly string[]
  /** Named in the error when the server does not come up. */
  serverLog?: string
}

interface Job {
  request: Model3dRequest
  status: Model3dStatus
  stdout: string[]
  stderr: string[]
  worker: WorkerProcess | null
}

type TurnResult = { kind: 'ready' } | { kind: 'requeue' } | { kind: 'failed'; error: string }

const iso = (ms: number): string => new Date(ms).toISOString()
const fifo = (a: Job, b: Job): number =>
  Date.parse(a.request.submittedAt) - Date.parse(b.request.submittedAt) || a.request.id.localeCompare(b.request.id)
const FINISHED: readonly Model3dJobState[] = ['done', 'failed', 'cancelled']
const isFinished = (state: Model3dJobState): boolean => FINISHED.includes(state)

function freshStatus(): Model3dStatus {
  return { state: 'queued', waitReason: null, progress: null, startedAt: null, endedAt: null, error: null, outputs: [] }
}

function readStoredStatus(value: unknown): Model3dStatus | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Partial<Model3dStatus>
  if (typeof s.state !== 'string' || !['queued', 'running', 'done', 'failed', 'cancelled'].includes(s.state)) return null
  return { ...freshStatus(), ...s, outputs: Array.isArray(s.outputs) ? s.outputs : [] }
}

/**
 * The 3D service (ADR 0011): watches the jobs folder, keeps the queue, gives one job at a time its GPU turn as a worker
 * process, and owns the ComfyUI3D server, the coord board's `gpu` claim and the idle stop.
 */
export function createModel3dService(ports: Model3dPorts, config: Model3dServiceConfig) {
  const { clock, coord, comfy } = ports
  const { folder } = config
  const jobs = new Map<string, Job>()
  /** Requests that are not valid, by id, with the time their failed status was written; pruned like finished jobs. */
  const rejected = new Map<string, number>()
  const listeners: ((view: Model3dView) => void)[] = []
  const stops: (() => void)[] = []

  let turn: Job | null = null
  let server: Model3dServerState = 'stopped'
  let startedByApp = false
  let proc: ServerProcess | null = null
  let claimed = false
  let stopping: Promise<void> | null = null
  let cancelIdle: (() => void) | null = null
  let disposed = false

  // Everything the service sets off is counted, so `settled()` can tell when it has nothing left but to wait on the outside.
  let inflight = 0
  let settledWaiters: (() => void)[] = []
  function done(): void {
    inflight--
    if (inflight > 0) return
    const waiters = settledWaiters
    settledWaiters = []
    for (const w of waiters) w()
  }
  function track(work: () => Promise<void>): void {
    inflight++
    void work()
      .catch((err) => console.error('[model3d]', err))
      .finally(done)
  }
  /** A wait on the clock that `settled()` does not count. */
  function pause(ms: number): Promise<void> {
    done()
    return new Promise((resolve) =>
      clock.after(ms, () => {
        inflight++
        resolve()
      })
    )
  }

  // State changes run one at a time.
  let chain: Promise<void> = Promise.resolve()
  function serial(work: () => Promise<void>): Promise<void> {
    const next = chain.then(work)
    chain = next.catch(() => undefined)
    return next
  }

  const writes = new Map<string, Promise<void>>()
  function persist(job: Job): void {
    const id = job.request.id
    track(async () => {
      const next = (writes.get(id) ?? Promise.resolve()).then(() => writeJsonAtomic(statusFile(folder, id), job.status))
      writes.set(id, next.catch(() => undefined))
      await next
    })
    changed()
  }

  let serviceWrite: Promise<void> = Promise.resolve()
  function writeService(): void {
    const file: Model3dServiceFile = { pid: config.pid, heartbeatAt: iso(clock.now()), server, startedByApp }
    track(async () => {
      const next = serviceWrite.then(() => writeJsonAtomic(join(folder, SERVICE_FILE), file))
      serviceWrite = next.catch(() => undefined)
      await next
    })
  }

  function view(): Model3dView {
    return {
      server,
      startedByApp,
      jobs: [...jobs.values()].sort(fifo).map((j): Model3dJob => ({ request: j.request, status: { ...j.status } }))
    }
  }
  function changed(): void {
    if (listeners.length === 0) return
    const v = view()
    for (const cb of listeners) cb(v)
  }

  function setStatus(job: Job, patch: Partial<Model3dStatus>): void {
    job.status = { ...job.status, ...patch }
    persist(job)
  }

  function end(job: Job, state: Model3dJobState, error: string | null, outputs = job.status.outputs): void {
    setStatus(job, { state, waitReason: null, endedAt: iso(clock.now()), error, outputs })
    if (turn === job) turn = null
  }

  async function prune(): Promise<void> {
    const finished = [
      ...[...jobs.values()].filter((j) => isFinished(j.status.state)).map((j) => ({ id: j.request.id, at: Date.parse(j.status.endedAt ?? '') || 0 })),
      ...[...rejected].map(([id, at]) => ({ id, at }))
    ].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
    for (const old of finished.slice(HISTORY_KEEP)) {
      jobs.delete(old.id)
      rejected.delete(old.id)
      await (writes.get(old.id) ?? Promise.resolve())
      await removeJobFiles(folder, old.id)
    }
    if (finished.length > HISTORY_KEEP) changed()
  }

  async function reject(id: string, error: string): Promise<void> {
    const at = clock.now()
    rejected.set(id, at)
    await writeJsonAtomic(statusFile(folder, id), { ...freshStatus(), state: 'failed', endedAt: iso(at), error } satisfies Model3dStatus)
  }

  /** On start: what a crash or quit left queued or running is cancelled, never resumed. */
  async function loadFolder(): Promise<void> {
    const { requests } = await listJobFiles(folder)
    for (const id of requests) {
      const raw = await readJson(requestFile(folder, id))
      const parsed = raw.kind === 'ok' ? parseModel3dRequest(raw.value) : null
      const stored = await readJson(statusFile(folder, id))
      const status = stored.kind === 'ok' ? readStoredStatus(stored.value) : null
      if (!parsed?.ok || parsed.request.id !== id) {
        if (status && isFinished(status.state)) rejected.set(id, Date.parse(status.endedAt ?? '') || 0)
        else await reject(id, `The request is not valid: ${parsed && !parsed.ok ? parsed.error : 'not JSON'}.`)
        continue
      }
      const job: Job = { request: parsed.request, status: status ?? freshStatus(), stdout: [], stderr: [], worker: null }
      jobs.set(id, job)
      if (!status || !isFinished(status.state)) end(job, 'cancelled', CANCELLED_APP_CLOSED)
    }
  }

  async function scan(): Promise<void> {
    const { requests } = await listJobFiles(folder)
    for (const id of requests) {
      if (jobs.has(id) || rejected.has(id)) continue
      const raw = await readJson(requestFile(folder, id))
      // Not JSON yet: gen3d.py may still be writing it; the next scan reads it again.
      if (raw.kind !== 'ok') continue
      const parsed = parseModel3dRequest(raw.value)
      if (!parsed.ok || parsed.request.id !== id) {
        await reject(id, `The request is not valid: ${parsed.ok ? 'its id does not match its file name' : parsed.error}.`)
        continue
      }
      const job: Job = { request: parsed.request, status: freshStatus(), stdout: [], stderr: [], worker: null }
      jobs.set(id, job)
      persist(job)
    }
  }

  const turnReason = (holder: Job): string => (holder.request.kind === 'editor' ? 'Waiting: editor open' : `Waiting: ${holder.request.summary} running`)

  /** Checks 2 and 3 (cluster or Unity running, another job's `gpu` claim); fetched once per round. */
  function outsideChecks(): (job: Job) => Promise<string | null> {
    let names: Promise<Set<string>> | null = null
    let claims: Promise<CoordClaim[]> | null = null
    const has = async (list: readonly string[]): Promise<boolean> => {
      names ??= ports.processes.list().then((l) => new Set(l.map((n) => n.toLowerCase())))
      const running = await names
      return list.some((n) => running.has(n.toLowerCase()))
    }
    return async (job) => {
      if (job.request.runAnyway) return null
      if (await has(config.clusterProcesses)) return 'Waiting: Darkfall cluster running'
      if (await has(config.unityProcesses)) return 'Waiting: Unity running'
      claims ??= coord.claims()
      const other = (await claims).find((c) => c.job !== COORD_JOB)
      return other ? `Waiting: gpu claimed by ${other.job} since ${clock.localTime(other.since)}` : null
    }
  }

  async function pump(): Promise<void> {
    if (disposed) return
    const queued = [...jobs.values()].filter((j) => j.status.state === 'queued').sort(fifo)
    const check = outsideChecks()
    for (const job of queued) {
      const reason = turn ? turnReason(turn) : await check(job)
      if (reason === null) {
        takeTurn(job)
        continue
      }
      if (job.status.waitReason !== reason) setStatus(job, { waitReason: reason })
    }
    await reconsiderIdle()
  }

  function takeTurn(job: Job): void {
    turn = job
    setStatus(job, { state: 'running', waitReason: null, startedAt: iso(clock.now()), progress: null })
    cancelIdleTimer()
    if (job.request.kind === 'editor') {
      end(job, 'failed', 'The editor turn is not supported yet.')
      return
    }
    track(() => runTurn(job))
  }

  async function runTurn(job: Job): Promise<void> {
    const result = await ensureServer(job.request.runAnyway)
    await serial(async () => {
      if (turn !== job || job.status.state !== 'running') return
      if (result.kind === 'ready') return launchWorker(job)
      turn = null
      if (result.kind === 'requeue') {
        // Checks again on the next 5 s round, not at once: a board that refuses without showing a holder must not spin.
        setStatus(job, { state: 'queued', startedAt: null, waitReason: CLAIM_REFUSED })
        return
      }
      end(job, 'failed', result.error)
      await prune()
      await pump()
    })
  }

  async function takeClaim(runAnyway: boolean): Promise<boolean> {
    if (claimed) return true
    claimed = await coord.claim()
    return claimed || runAnyway
  }

  async function releaseClaim(): Promise<void> {
    if (!claimed) return
    claimed = false
    await coord.unclaim()
  }

  /** The server for a turn: the app's own, one already answering outside the app, or a fresh start; the `gpu` claim is taken first. */
  async function ensureServer(runAnyway: boolean): Promise<TurnResult> {
    if (stopping) await stopping
    if (server === 'ready' && startedByApp && proc) return { kind: 'ready' }
    if (await comfy.up()) {
      if (!(await takeClaim(runAnyway))) return { kind: 'requeue' }
      if (server !== 'ready' || startedByApp) {
        server = 'ready'
        startedByApp = false
        writeService()
        changed()
      }
      return { kind: 'ready' }
    }
    if (!(await takeClaim(runAnyway))) return { kind: 'requeue' }
    server = 'starting'
    startedByApp = true
    writeService()
    changed()
    let started: ServerProcess
    try {
      started = await ports.server.start()
    } catch (err) {
      await serverGone()
      return { kind: 'failed', error: `The 3D server could not start: ${err instanceof Error ? err.message : String(err)}` }
    }
    proc = started
    started.onExit(() => track(() => serial(async () => {
      if (proc !== started) return
      proc = null
      await serverGone()
      await reconsiderIdle()
    })))
    const seeLog = config.serverLog ? `; see ${config.serverLog}` : ''
    const deadline = clock.now() + READY_TIMEOUT_MS
    for (;;) {
      if (proc !== started) return { kind: 'failed', error: `The 3D server ended before it answered${seeLog}.` }
      if (await comfy.up()) {
        server = 'ready'
        writeService()
        changed()
        return { kind: 'ready' }
      }
      if (clock.now() >= deadline) {
        await stopServer()
        return { kind: 'failed', error: `The 3D server did not answer within ${READY_TIMEOUT_MS / 1000} s${seeLog}.` }
      }
      await pause(READY_POLL_MS)
    }
  }

  async function serverGone(): Promise<void> {
    server = 'stopped'
    startedByApp = false
    await releaseClaim()
    writeService()
    changed()
  }

  async function stopServer(): Promise<void> {
    const running = proc
    proc = null
    server = 'stopping'
    writeService()
    changed()
    stopping = (running?.stop() ?? Promise.resolve()).then(serverGone)
    try {
      await stopping
    } finally {
      stopping = null
    }
  }

  function cancelIdleTimer(): void {
    cancelIdle?.()
    cancelIdle = null
  }

  /** The idle stop runs only while the queue is empty, no turn is held and the app started the server; an outside server is only let go of. */
  async function reconsiderIdle(): Promise<void> {
    const empty = !turn && ![...jobs.values()].some((j) => j.status.state === 'queued')
    if (empty && server === 'ready' && !startedByApp) await releaseClaim()
    const idle = empty && server === 'ready' && startedByApp
    if (!idle) return cancelIdleTimer()
    if (cancelIdle) return
    cancelIdle = clock.after(IDLE_STOP_MS, () => {
      cancelIdle = null
      track(() => serial(async () => {
        if (!turn && ![...jobs.values()].some((j) => j.status.state === 'queued') && server === 'ready' && startedByApp) await stopServer()
      }))
    })
  }

  function launchWorker(job: Job): void {
    const { request } = job
    const clientId = randomUUID()
    const progress = (patch: Partial<Model3dProgress>, fresh: boolean): void =>
      track(() => serial(async () => {
        if (job.status.state !== 'running') return
        const base = fresh || !job.status.progress ? { item: null, of: null, name: null, stage: null, step: null, steps: null } : job.status.progress
        setStatus(job, { progress: { ...base, ...patch } })
      }))
    const stopWatch = comfy.watchProgress(clientId, (step, steps) => progress({ step, steps }, false))
    const events: WorkerEvents = {
      stdout: (line) => job.stdout.push(line),
      stderr: (line) => {
        job.stderr.push(line)
        if (job.stderr.length > STDERR_KEEP) job.stderr.shift()
        const marker = progressMarker(line)
        if (marker) progress(marker, true)
      },
      exit: (code) => {
        stopWatch()
        track(() => serial(() => finishWorker(job, code)))
      }
    }
    try {
      job.worker = ports.workers.run({ python: request.python, args: [request.script, ...request.argv, '--service-worker'], cwd: request.cwd, clientId }, events)
    } catch (err) {
      stopWatch()
      job.stderr.push(`The worker could not start: ${err instanceof Error ? err.message : String(err)}`)
      track(() => serial(() => finishWorker(job, null)))
    }
  }

  async function finishWorker(job: Job, code: number | null): Promise<void> {
    job.worker = null
    if (job.status.state !== 'running') return
    const outputs = await workerOutputs(job.stdout, job.request.cwd)
    if (code === 0 && outputs.length > 0) end(job, 'done', null, outputs)
    else {
      const fallback = code === 0 ? 'The batch made no models.' : `The worker ended with exit code ${code ?? 'unknown'}.`
      end(job, 'failed', workerError(job.stderr) ?? fallback, outputs)
    }
    await prune()
    await pump()
  }

  const kick = (): void => track(() => serial(async () => {
    if (disposed) return
    await scan()
    await pump()
  }))

  return {
    /** Creates the folder, cancels what an earlier run left queued or running, releases a stale claim and starts watching. */
    async start(): Promise<void> {
      await fs.mkdir(folder, { recursive: true })
      await serial(async () => {
        await loadFolder()
        await coord.unclaim()
        await prune()
      })
      writeService()
      stops.push(clock.every(HEARTBEAT_MS, writeService))
      stops.push(clock.every(CHECK_MS, kick))
      stops.push(ports.watchFolder(folder, kick))
    },
    /** Resolves once nothing the service set off is left but waits on the clock, a worker or the server. */
    settled(): Promise<void> {
      if (inflight === 0) return chain
      return new Promise<void>((resolve) => settledWaiters.push(resolve)).then(() => this.settled())
    },
    view,
    onChanged(cb: (view: Model3dView) => void): () => void {
      listeners.push(cb)
      return () => {
        const at = listeners.indexOf(cb)
        if (at >= 0) listeners.splice(at, 1)
      }
    },
    /**
     * Quit: the server stop and the unclaim are set off before anything is awaited, so they run even if the app ends
     * right after; queued and running jobs end cancelled.
     */
    async shutdown(): Promise<void> {
      disposed = true
      for (const stop of stops.splice(0)) stop()
      cancelIdleTimer()
      const serverStop = startedByApp && proc ? proc.stop() : Promise.resolve()
      proc = null
      const unclaim = claimed ? coord.unclaim() : Promise.resolve()
      claimed = false
      const kills: Promise<void>[] = []
      for (const job of jobs.values()) {
        if (isFinished(job.status.state)) continue
        if (job.worker) kills.push(job.worker.kill())
        end(job, 'cancelled', CANCELLED_APP_CLOSED)
      }
      turn = null
      await Promise.all([serverStop, unclaim, ...kills])
      server = 'stopped'
      startedByApp = false
      writeService()
      await this.settled()
    },
    /** Stops the timers and the folder watch; the server and the files are left as they are. */
    dispose(): void {
      disposed = true
      for (const stop of stops.splice(0)) stop()
      cancelIdleTimer()
    }
  }
}

export type Model3dService = ReturnType<typeof createModel3dService>
