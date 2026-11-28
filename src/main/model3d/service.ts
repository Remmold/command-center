import { randomUUID } from 'node:crypto'
import {
  MODEL3D_APP_SESSION,
  parseModel3dRequest,
  type Model3dActionResult,
  type Model3dJob,
  type Model3dJobState,
  type Model3dOutput,
  type Model3dProgress,
  type Model3dRequest,
  type Model3dServerState,
  type Model3dServiceFile,
  type Model3dStage,
  type Model3dStatus,
  type Model3dView
} from '../../shared/model3d'
import type { JobsFolder } from './jobsFolder'
import { failedItems, progressMarker, workerError, workerOutputs, workerPictures } from './workerOutput'

/** The app's job name on the coord board. */
export const COORD_JOB = 'command-center-3d'
export const IDLE_STOP_MS = 10 * 60_000
/** coord.py's `GPU_CLAIM_MAX_MIN`: the next `claim` by anyone drops a `gpu` claim older than this, and a repeat claim keeps its age. */
export const GPU_CLAIM_MAX_MS = 180 * 60_000

export interface Model3dTimings {
  heartbeatMs: number
  /** The scan, orphan drop, outside checks and outside-server probe. */
  checkMs: number
  idleStopMs: number
  readyTimeoutMs: number
  readyPollMs: number
  /** A held claim is taken afresh once it is this old, before coord.py would drop it. */
  claimRefreshMs: number
  /** A check round still waiting on tasklist or coord.py this long names the slow call as the wait reason. */
  roundSlowMs: number
}

export const MODEL3D_TIMINGS: Model3dTimings = {
  heartbeatMs: 5_000,
  checkMs: 5_000,
  idleStopMs: IDLE_STOP_MS,
  readyTimeoutMs: 120_000,
  readyPollMs: 1_000,
  claimRefreshMs: 150 * 60_000,
  roundSlowMs: 8_000
}
export const HISTORY_KEEP = 50
export const CANCELLED_APP_CLOSED = 'Cancelled: app closed'
export const STOP_REFUSED_RUNNING = 'A job is running. Wait for it to finish, then stop the server.'
export const STOP_REFUSED_EDITOR = 'The editor is open. Click Done with editor, then stop the server.'
const EDITOR_NOT_OPEN = 'The editor is not open.'
const EDITOR_TAKEN = 'The editor is already open or queued.'
export const CANCELLED = 'Cancelled in Command Center'
export const STOP_OUTSIDE_FAILED = 'The 3D server still answers: no ComfyUI process (python running main.py) was found on its port to stop.'
export const DROPPED_ORPHAN = 'Dropped: waiting gen3d.py ended'
const ALREADY_FINISHED = 'The job has already finished.'
export const NO_SUCH_JOB = 'There is no such job.'
const CLAIM_REFUSED = 'Waiting: the coord board refused the gpu claim'
export const CHECKING = 'Waiting: checking for the cluster, Unity and gpu claims'
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

/** The board's `gpu` claims, or why coord.py could not be run. */
export type CoordReading = { ok: true; claims: CoordClaim[] } | { ok: false; error: string }

/** The coord board's `gpu` claims; a board whose script is missing has none and takes every claim. */
export interface CoordBoard {
  claims(): Promise<CoordReading>
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
  /** Whether `/queue` lists a running or pending prompt. */
  busy(): Promise<boolean>
  free(): Promise<void>
}

export interface ServerProcess {
  /** Stops the server's whole process tree. */
  stop(): Promise<void>
  onExit(cb: () => void): void
}

export interface ServerLauncher {
  start(): Promise<ServerProcess>
  /** Stops a server that answers on the port but was started outside the app, with its process tree. */
  stopOutside(): Promise<void>
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
  alive(pid: number): Promise<boolean>
}

export interface Model3dPorts {
  clock: Model3dClock
  processes: ProcessList
  coord: CoordBoard
  comfy: ComfyClient
  server: ServerLauncher
  workers: WorkerRunner
  jobs: JobsFolder
  /** Why a generate request may not run as a worker (its script, python or cwd), or null when it may. */
  vetRequest(request: Model3dRequest): Promise<string | null>
  /** Calls back when something in the folder changes; returns the stop. The 5 s scan runs either way. */
  watchFolder(folder: string, onChange: () => void): () => void
  /** Writes `service.json` atomically: on start, on each server change and as the 5 s heartbeat. */
  writeServiceFile(file: Model3dServiceFile): Promise<void>
  /** Opens the editor's page, `http://127.0.0.1:<port>`, in the browser. */
  openEditor(): Promise<void>
}

export interface Model3dServiceConfig {
  folder: string
  /** Written to service.json, so gen3d.py can tell the app is alive. */
  pid: number
  clusterProcesses: readonly string[]
  unityProcesses: readonly string[]
  /** Named in the error when the server does not come up. */
  serverLog?: string
  timings?: Partial<Model3dTimings>
}

interface Job {
  request: Model3dRequest
  status: Model3dStatus
  stdout: string[]
  stderr: string[]
  worker: WorkerProcess | null
  /** Whether `waitReason` names the job that held the GPU turn, so it is stale once that turn ends. */
  waitIsTurn: boolean
}

/** One check round's look at the outside: running process names (lower case) and the coord board's `gpu` claims. */
interface Outside {
  round: number
  names: Set<string>
  /** Why tasklist failed: then the cluster and Unity checks cannot be made. */
  listError: string | null
  board: CoordReading
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

const STATES: readonly Model3dJobState[] = ['queued', 'running', 'done', 'failed', 'cancelled']
const STAGES: readonly string[] = ['picture', 'mask', 'generate', 'render']
const textOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

function storedOutput(v: unknown): Model3dOutput | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.glb !== 'string' || o.glb === '') return null
  const out: Model3dOutput = { glb: o.glb }
  if (typeof o.sheet === 'string') out.sheet = o.sheet
  if (typeof o.json === 'string') out.json = o.json
  return out
}

function storedProgress(v: unknown): Model3dProgress | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  return {
    item: intOrNull(p.item),
    of: intOrNull(p.of),
    name: textOrNull(p.name),
    stage: STAGES.includes(p.stage as string) ? (p.stage as Model3dStage) : null,
    step: intOrNull(p.step),
    steps: intOrNull(p.steps)
  }
}

/** A status read back from disk, each field checked: one of the wrong shape counts as missing. */
function readStoredStatus(value: unknown): Model3dStatus | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Record<string, unknown>
  if (!STATES.includes(s.state as Model3dJobState)) return null
  const pictures = Array.isArray(s.pictures) ? s.pictures.filter((p): p is string => typeof p === 'string' && p !== '') : []
  return {
    state: s.state as Model3dJobState,
    waitReason: textOrNull(s.waitReason),
    progress: storedProgress(s.progress),
    startedAt: textOrNull(s.startedAt),
    endedAt: textOrNull(s.endedAt),
    error: textOrNull(s.error),
    outputs: Array.isArray(s.outputs) ? s.outputs.map(storedOutput).filter((o): o is Model3dOutput => o !== null) : [],
    ...(pictures.length > 0 ? { pictures } : {})
  }
}

/**
 * The 3D service (ADR 0011): watches the jobs folder, keeps the queue, gives one job at a time its GPU turn as a worker
 * process, and owns the ComfyUI3D server, the coord board's `gpu` claim and the idle stop.
 */
export function createModel3dService(ports: Model3dPorts, config: Model3dServiceConfig) {
  const { clock, coord, comfy, jobs: files } = ports
  const { folder } = config
  const timings: Model3dTimings = { ...MODEL3D_TIMINGS, ...config.timings }
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
  /** When the held claim was taken, by the app's clock. */
  let claimedAt = 0
  /** A server left answering by an earlier run: the claim is kept until its ComfyUI queue is empty. */
  let draining = false
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
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work)
    chain = next.then(() => undefined, () => undefined)
    return next
  }

  const writes = new Map<string, Promise<void>>()
  function persist(job: Job): void {
    const id = job.request.id
    track(async () => {
      const status = job.status
      const next = (writes.get(id) ?? Promise.resolve()).then(() => files.writeStatus(id, status))
      writes.set(id, next.catch(() => undefined))
      await next
    })
    changed()
  }

  let serviceWrite: Promise<void> = Promise.resolve()
  function writeService(): void {
    const file: Model3dServiceFile = { pid: config.pid, heartbeatAt: iso(clock.now()), server, startedByApp }
    track(async () => {
      const next = serviceWrite.then(() => ports.writeServiceFile(file))
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
    if (turn === job) freeTurn()
  }

  function freeTurn(): void {
    turn = null
    needFresh()
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
      writes.delete(old.id)
      await files.remove(old.id)
    }
    if (finished.length > HISTORY_KEEP) changed()
  }

  async function reject(id: string, error: string): Promise<void> {
    const at = clock.now()
    rejected.set(id, at)
    await files.writeStatus(id, { ...freshStatus(), state: 'failed', endedAt: iso(at), error })
  }

  /** On start: what a crash or quit left queued or running is cancelled, never resumed. */
  async function loadFolder(): Promise<void> {
    for (const id of await files.requests()) {
      const raw = await files.readRequest(id)
      const parsed = raw.kind === 'ok' ? parseModel3dRequest(raw.value) : null
      const stored = await files.readStatus(id)
      const status = stored.kind === 'ok' ? readStoredStatus(stored.value) : null
      if (!parsed?.ok || parsed.request.id !== id) {
        if (status && isFinished(status.state)) rejected.set(id, Date.parse(status.endedAt ?? '') || 0)
        else await reject(id, `The request is not valid: ${parsed && !parsed.ok ? parsed.error : 'not JSON'}.`)
        continue
      }
      const job: Job = { request: parsed.request, status: status ?? freshStatus(), stdout: [], stderr: [], worker: null, waitIsTurn: false }
      jobs.set(id, job)
      if (!status || !isFinished(status.state)) end(job, 'cancelled', CANCELLED_APP_CLOSED)
    }
  }

  async function scan(): Promise<void> {
    for (const id of await files.requests()) {
      if (jobs.has(id) || rejected.has(id)) continue
      const raw = await files.readRequest(id)
      // Not JSON yet: gen3d.py may still be writing it; the next scan reads it again.
      if (raw.kind !== 'ok') continue
      const parsed = parseModel3dRequest(raw.value)
      if (!parsed.ok || parsed.request.id !== id) {
        await reject(id, `The request is not valid: ${parsed.ok ? 'its id does not match its file name' : parsed.error}.`)
        continue
      }
      // Only a generate request runs a process; it may name only the skill's own script, an interpreter and a folder.
      const problem = parsed.request.kind === 'generate' ? await ports.vetRequest(parsed.request) : null
      if (problem) {
        await reject(id, `The request is not valid: ${problem}.`)
        continue
      }
      const job: Job = { request: parsed.request, status: freshStatus(), stdout: [], stderr: [], worker: null, waitIsTurn: false }
      jobs.set(id, job)
      needFresh()
      persist(job)
    }
  }

  const turnReason = (holder: Job): string => (holder.request.kind === 'editor' ? 'Waiting: editor open' : `Waiting: ${holder.request.summary} running`)

  // Checks 2 and 3 (cluster or Unity running, another job's `gpu` claim) run as rounds outside the serial chain, so
  // one slow tasklist or coord.py call holds neither the chain nor the queue: a newer round that lands first wins.
  let rounds = 0
  let outside: Outside | null = null
  /** The first round whose answer may start a job: one that began after the last turn ended or job arrived. */
  let freshFrom = 1
  /** A fresh round that has not answered within `roundSlowMs`: the wait reason names its calls still out. */
  let slow: { round: number; reason: string } | null = null
  function needFresh(): void {
    freshFrom = rounds + 1
    slow = null
  }

  function slowReason(pending: { list: boolean; coord: boolean }): string | null {
    const out = [pending.list ? 'tasklist' : null, pending.coord ? 'the coord board' : null].filter((n): n is string => n !== null)
    if (out.length === 0) return null
    return `Waiting: ${out.join(' and ')} ${out.length > 1 ? 'have' : 'has'} not answered in ${timings.roundSlowMs / 1000} s`
  }

  function startRound(): void {
    const round = ++rounds
    const pending = { list: true, coord: true }
    let late = false
    const markSlow = (): void => track(() => serial(async () => {
      if (disposed || round < freshFrom || (outside && outside.round >= round) || (slow && slow.round > round)) return
      const reason = slowReason(pending)
      if (reason === null || slow?.reason === reason) return
      slow = { round, reason }
      await pump()
    }))
    const cancelSlow = clock.after(timings.roundSlowMs, () => {
      late = true
      markSlow()
    })
    const answered = (part: 'list' | 'coord'): void => {
      pending[part] = false
      if (late) markSlow()
    }
    track(async () => {
      const [list, board] = await Promise.all([
        ports.processes.list().then(
          (names) => ({ names, error: null }),
          (err: unknown) => ({ names: [], error: err instanceof Error ? err.message : String(err) })
        ).finally(() => answered('list')),
        coord.claims().catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })).finally(() => answered('coord'))
      ])
      cancelSlow()
      await serial(async () => {
        if (outside && outside.round > round) return
        outside = { round, names: new Set(list.names.map((n) => n.toLowerCase())), listError: list.error, board }
        if (slow && slow.round <= round) slow = null
        await pump()
      })
    })
  }

  const needsCheck = (): boolean => !turn && [...jobs.values()].some((j) => j.status.state === 'queued' && !j.request.runAnyway)

  function outsideReason(seen: Outside): string | null {
    const has = (list: readonly string[]): boolean => list.some((n) => seen.names.has(n.toLowerCase()))
    if (seen.listError !== null) return `Waiting: tasklist could not be run: ${seen.listError}`
    if (has(config.clusterProcesses)) return 'Waiting: Darkfall cluster running'
    if (has(config.unityProcesses)) return 'Waiting: Unity running'
    if (!seen.board.ok) return `Waiting: coord board could not be run: ${seen.board.error}`
    // coord.py drops a gpu claim this old on the next claim, and its `claims` still lists it until then.
    const other = seen.board.claims.find((c) => c.job !== COORD_JOB && clock.now() - c.since <= GPU_CLAIM_MAX_MS)
    return other ? `Waiting: gpu claimed by ${other.job} since ${clock.localTime(other.since)}` : null
  }

  function setWait(job: Job, reason: string, isTurn: boolean): void {
    job.waitIsTurn = isTurn
    if (job.status.waitReason !== reason) setStatus(job, { waitReason: reason })
  }

  async function pump(): Promise<void> {
    if (disposed) return
    const queued = [...jobs.values()].filter((j) => j.status.state === 'queued').sort(fifo)
    const fresh = outside && outside.round >= freshFrom ? outside : null
    let checking = false
    for (const job of queued) {
      if (turn) {
        setWait(job, turnReason(turn), true)
        continue
      }
      // A job behind one still being checked waits for that answer too, so the queue keeps its order.
      if (checking || (!fresh && !job.request.runAnyway)) {
        checking = true
        if (slow) setWait(job, slow.reason, false)
        else if (job.status.waitReason === null || job.waitIsTurn) setWait(job, CHECKING, false)
        continue
      }
      const reason = job.request.runAnyway || !fresh ? null : outsideReason(fresh)
      if (reason === null) {
        takeTurn(job)
        continue
      }
      setWait(job, reason, false)
    }
    if (checking && rounds < freshFrom) startRound()
    await reconsiderIdle()
  }

  function takeTurn(job: Job): void {
    turn = job
    setStatus(job, { state: 'running', waitReason: null, startedAt: iso(clock.now()), progress: null })
    cancelIdleTimer()
    track(() => runTurn(job))
  }

  async function runTurn(job: Job): Promise<void> {
    const result = await ensureServer(job.request.runAnyway)
    await serial(async () => {
      // Ended while the server came up: the idle stop is weighed again, or a server started for nobody would run on.
      if (turn !== job || job.status.state !== 'running') return reconsiderIdle()
      if (result.kind === 'ready') return job.request.kind === 'editor' ? openEditor() : launchWorker(job)
      freeTurn()
      if (result.kind === 'requeue') {
        // Checks again on the next 5 s round, not at once: a board that refuses without showing a holder must not spin.
        job.waitIsTurn = false
        setStatus(job, { state: 'queued', startedAt: null, waitReason: CLAIM_REFUSED })
        return
      }
      end(job, 'failed', result.error)
      await prune()
      await pump()
    })
  }

  function openEditor(): void {
    track(() => ports.openEditor())
  }

  /** Asks the board for the claim; true when the app holds it afterwards. */
  async function claimNow(): Promise<boolean> {
    claimed = await coord.claim()
    if (claimed) claimedAt = clock.now()
    // The app quit while the board answered: shutdown has already let go of the claim, so this one is given back.
    if (disposed && claimed) {
      claimed = false
      await coord.unclaim()
    }
    return claimed
  }

  /** A repeat claim keeps its first time on the board, so a held claim is given back and taken again to restart its 180 min. */
  async function refreshClaim(): Promise<boolean> {
    if (claimed) await coord.unclaim()
    return claimNow()
  }

  /** At each turn start the claim is taken afresh, so a turn always has the full 180 min of the board's rule. */
  async function takeClaim(runAnyway: boolean): Promise<boolean> {
    return (await refreshClaim()) || runAnyway
  }

  async function releaseClaim(): Promise<void> {
    draining = false
    if (!claimed) return
    claimed = false
    await coord.unclaim()
  }

  // A turn that takes over while an earlier one still brings the server up waits for it, so the server starts once.
  // That wait is on the earlier start, which counts itself, so `settled()` does not count the waiter.
  let bringing: Promise<TurnResult> | null = null
  async function ensureServer(runAnyway: boolean): Promise<TurnResult> {
    while (bringing) {
      const earlier = bringing
      done()
      await earlier.catch(() => undefined)
      inflight++
    }
    const mine = bringUpServer(runAnyway)
    bringing = mine
    try {
      return await mine
    } finally {
      if (bringing === mine) bringing = null
    }
  }

  /** The server for a turn: the app's own, one already answering outside the app, or a fresh start; the `gpu` claim is taken first. */
  async function bringUpServer(runAnyway: boolean): Promise<TurnResult> {
    if (stopping) await stopping
    if (server === 'ready' && startedByApp && proc) return (await takeClaim(runAnyway)) ? { kind: 'ready' } : { kind: 'requeue' }
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
    if (disposed) {
      await started.stop()
      await serverGone()
      return { kind: 'failed', error: CANCELLED_APP_CLOSED }
    }
    proc = started
    started.onExit(() => track(() => serial(async () => {
      if (proc !== started) return
      proc = null
      await serverGone()
      await reconsiderIdle()
    })))
    const seeLog = config.serverLog ? `; see ${config.serverLog}` : ''
    const deadline = clock.now() + timings.readyTimeoutMs
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
        return { kind: 'failed', error: `The 3D server did not answer within ${timings.readyTimeoutMs / 1000} s${seeLog}.` }
      }
      await pause(timings.readyPollMs)
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
    if (empty && server === 'ready' && !startedByApp && !draining) await releaseClaim()
    const idle = empty && server === 'ready' && startedByApp
    if (!idle) return cancelIdleTimer()
    if (cancelIdle) return
    cancelIdle = clock.after(timings.idleStopMs, () => {
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
    const pictures = workerPictures(job.stdout, job.request.cwd)
    if (code === 0 && outputs.length + pictures.length > 0) {
      const failed = failedItems(job.stderr)
      const total = Math.max(job.status.progress?.of ?? 0, outputs.length + pictures.length + failed.length)
      if (pictures.length > 0) job.status = { ...job.status, pictures }
      end(job, 'done', failed.length > 0 ? `${failed.length} of ${total} failed: ${failed.join('; ')}` : null, outputs)
    }
    else {
      const fallback = code === 0 ? 'The batch made no models or pictures.' : `The worker ended with exit code ${code ?? 'unknown'}.`
      end(job, 'failed', workerError(job.stderr) ?? fallback, outputs)
    }
    await prune()
    await pump()
  }

  /** A queued job whose waiting gen3d.py has ended is dropped; a `--no-wait` job has no waiter, and a running job always finishes. */
  async function dropOrphans(): Promise<void> {
    let dropped = false
    for (const job of jobs.values()) {
      if (job.status.state !== 'queued' || !job.request.wait) continue
      if (await ports.processes.alive(job.request.waiterPid)) continue
      end(job, 'cancelled', DROPPED_ORPHAN)
      dropped = true
    }
    if (dropped) await prune()
  }

  async function cancelRunning(job: Job): Promise<void> {
    const worker = job.worker
    end(job, 'cancelled', CANCELLED)
    // The kill comes before the queue clear, so a prompt the worker queues after the interrupt is cleared too.
    await comfy.interrupt()
    await worker?.kill()
    await comfy.clearQueue()
  }

  /** The claim stays on the board while the server is up: refreshed before coord.py's 180 min would drop it. */
  async function keepClaim(): Promise<void> {
    if (!claimed || server === 'stopped' || clock.now() - claimedAt < timings.claimRefreshMs) return
    await refreshClaim()
  }

  /**
   * A server the app did not start may end without the app knowing, so it is asked on each check, outside the chain
   * like the wait checks. One left by an earlier run keeps the claim until its ComfyUI queue is empty.
   */
  function probeOutside(): void {
    if (server !== 'ready' || startedByApp) return
    track(async () => {
      const up = await comfy.up()
      const busy = up && draining ? await comfy.busy() : false
      await serial(async () => {
        if (disposed || server !== 'ready' || startedByApp) return
        if (!up) {
          await serverGone()
          return pump()
        }
        if (draining && !busy) {
          draining = false
          await reconsiderIdle()
        }
      })
    })
  }

  const kick = (): void => track(() => serial(async () => {
    if (disposed) return
    await scan()
    await dropOrphans()
    await keepClaim()
    probeOutside()
    if (needsCheck()) startRound()
    await pump()
  }))

  /** A server still answering at start was left by an earlier run or started outside: its work is stopped and it is used as an outside server. */
  async function adoptLeftServer(): Promise<void> {
    // A claim an earlier run left keeps its first time on the board, so it is let go of either way.
    await coord.unclaim()
    if (!(await comfy.up())) return
    await comfy.interrupt()
    await comfy.clearQueue()
    server = 'ready'
    startedByApp = false
    draining = true
    await claimNow()
    changed()
  }

  return {
    /**
     * Creates the folder, cancels what an earlier run left queued or running, and starts watching. A stale claim is
     * released, unless a server still answers: then its work is stopped and it is kept as an outside server.
     */
    async start(): Promise<void> {
      await files.ensure()
      await serial(async () => {
        await loadFolder()
        await adoptLeftServer()
        await prune()
      })
      writeService()
      stops.push(clock.every(timings.heartbeatMs, writeService))
      stops.push(clock.every(timings.checkMs, kick))
      stops.push(ports.watchFolder(folder, kick))
    },
    /** Resolves once nothing the service set off is left but waits on the clock, a worker or the server. */
    settled(): Promise<void> {
      if (inflight === 0) return chain
      return new Promise<void>((resolve) => settledWaiters.push(resolve)).then(() => this.settled())
    },
    view,
    /** What the quit question counts: queued and running 3D jobs, and whether an editor turn is queued or held. */
    unfinished(): { jobs: number; editor: boolean } {
      const open = [...jobs.values()].filter((j) => !isFinished(j.status.state))
      return { jobs: open.filter((j) => j.request.kind !== 'editor').length, editor: open.some((j) => j.request.kind === 'editor') }
    },
    /** Stop server: at once, whoever started it; refused while a job holds the GPU turn. */
    stopServer(): Promise<Model3dActionResult> {
      return serial(async () => {
        if (turn) return { ok: false as const, error: turn.request.kind === 'editor' ? STOP_REFUSED_EDITOR : STOP_REFUSED_RUNNING }
        cancelIdleTimer()
        if (server === 'ready' && !startedByApp) {
          server = 'stopping'
          writeService()
          changed()
          await ports.server.stopOutside()
          if (await comfy.up()) {
            server = 'ready'
            writeService()
            changed()
            return { ok: false as const, error: STOP_OUTSIDE_FAILED }
          }
          await serverGone()
        } else if (server === 'ready' || proc) await stopServer()
        return { ok: true as const }
      })
    },
    /** Cancel: a queued job ends at once; a running one has ComfyUI interrupted and its queue cleared, and its worker killed. */
    cancel(id: string): Promise<Model3dActionResult> {
      return serial(async () => {
        const job = jobs.get(id)
        if (!job) return { ok: false as const, error: NO_SUCH_JOB }
        if (isFinished(job.status.state)) return { ok: false as const, error: ALREADY_FINISHED }
        if (job.status.state === 'running') await cancelRunning(job)
        else end(job, 'cancelled', CANCELLED)
        await prune()
        await pump()
        return { ok: true as const }
      })
    },
    /** Open editor: an editor request from the app itself, queued like a job; one editor turn at a time. */
    openEditor(): Promise<Model3dActionResult> {
      return serial(async () => {
        if ([...jobs.values()].some((j) => j.request.kind === 'editor' && !isFinished(j.status.state))) return { ok: false as const, error: EDITOR_TAKEN }
        const request: Model3dRequest = {
          id: `editor-${randomUUID()}`,
          kind: 'editor',
          argv: ['ui'],
          cwd: folder,
          python: '',
          script: '',
          waiterPid: config.pid,
          wait: false,
          sessionId: MODEL3D_APP_SESSION,
          configDir: '',
          submittedAt: iso(clock.now()),
          summary: 'editor',
          runAnyway: false
        }
        await files.writeRequest(request.id, request)
        const job: Job = { request, status: freshStatus(), stdout: [], stderr: [], worker: null, waitIsTurn: false }
        jobs.set(request.id, job)
        needFresh()
        persist(job)
        await pump()
        return { ok: true as const }
      })
    },
    /** Done with editor: the held editor turn ends done and the next job gets the GPU. */
    doneWithEditor(): Promise<Model3dActionResult> {
      return serial(async () => {
        if (turn?.request.kind !== 'editor') return { ok: false as const, error: EDITOR_NOT_OPEN }
        end(turn, 'done', null)
        await prune()
        await pump()
        return { ok: true as const }
      })
    },
    /** Run anyway on a waiting job: it skips the cluster, Unity and coord checks from now on, never the GPU turn. */
    runAnyway(id: string): Promise<Model3dActionResult> {
      return serial(async () => {
        const job = jobs.get(id)
        if (!job) return { ok: false as const, error: NO_SUCH_JOB }
        if (job.status.state !== 'queued') return { ok: false as const, error: 'The job is not waiting.' }
        job.request = { ...job.request, runAnyway: true }
        changed()
        await pump()
        return { ok: true as const }
      })
    },
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
