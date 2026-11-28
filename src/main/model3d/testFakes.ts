import type { Model3dRequest, Model3dServiceFile, Model3dStatus } from '../../shared/model3d'
import { parseJsonText, requestIds, requestName, statusName, type JobsFolder, type ReadResult } from './jobsFolder'
import { GPU_CLAIM_MAX_MS, type CoordClaim, type CoordReading, type Model3dClock, type Model3dPorts, type ServerProcess, type WorkerEvents, type WorkerSpec } from './service'

interface Timer {
  at: number
  every: number | null
  fn: () => void
  live: boolean
}

export class FakeClock implements Model3dClock {
  private t: number
  private timers: Timer[] = []
  constructor(start = Date.parse('2026-11-28T10:00:00Z')) {
    this.t = start
  }
  now = (): number => this.t
  localTime = (ms: number): string => new Date(ms).toISOString().slice(11, 16)
  every = (ms: number, fn: () => void): (() => void) => this.add(ms, ms, fn)
  after = (ms: number, fn: () => void): (() => void) => this.add(ms, null, fn)
  private add(ms: number, every: number | null, fn: () => void): () => void {
    const timer: Timer = { at: this.t + ms, every, fn, live: true }
    this.timers.push(timer)
    return () => {
      timer.live = false
    }
  }
  pending(): number {
    return this.timers.filter((x) => x.live && x.every === null).length
  }
  /** Moves time on, firing each due timer in order; `between` runs after each fire, e.g. to let the service settle. */
  async advance(ms: number, between: () => Promise<void> = async () => undefined): Promise<void> {
    const end = this.t + ms
    for (;;) {
      const due = this.timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.t = due.at
      if (due.every === null) due.live = false
      else due.at += due.every
      due.fn()
      await between()
    }
    this.t = end
    await between()
  }
}

/** coord.py's gpu rules: `claims` lists every claim, a `claim` by anyone first drops those older than 180 min, and a repeat claim keeps its time. */
export class FakeCoord {
  claimsList: CoordClaim[] = []
  calls: string[] = []
  /** Refuses every claim without listing a holder, as a board whose python fails would. */
  refuse = false
  constructor(private readonly clock: { now(): number }) {}
  /** Set, coord.py cannot be run and `claims` gives this reason. */
  broken: string | null = null
  async claims(): Promise<CoordReading> {
    if (this.broken) return { ok: false, error: this.broken }
    return { ok: true, claims: this.claimsList.map((c) => ({ ...c })) }
  }
  async claim(): Promise<boolean> {
    this.calls.push('claim')
    if (this.refuse) return false
    return this.claimAs('command-center-3d')
  }
  /** A `claim <job> gpu` from any job. */
  claimAs(job: string): boolean {
    this.claimsList = this.claimsList.filter((c) => this.clock.now() - c.since <= GPU_CLAIM_MAX_MS)
    if (this.claimsList.some((c) => c.job !== job)) return false
    if (!this.claimsList.some((c) => c.job === job)) this.claimsList.push({ job, since: this.clock.now(), why: 'test' })
    return true
  }
  async unclaim(): Promise<void> {
    this.calls.push('unclaim')
    this.claimsList = this.claimsList.filter((c) => c.job !== 'command-center-3d')
  }
  holds(): boolean {
    return this.claimsList.some((c) => c.job === 'command-center-3d')
  }
}

export class FakeComfy {
  answering = false
  /** Whether `/queue` lists a running or pending prompt. */
  queued = false
  watchers = new Map<string, (step: number, steps: number) => void>()
  calls: string[] = []
  async up(): Promise<boolean> {
    return this.answering
  }
  watchProgress(clientId: string, onStep: (step: number, steps: number) => void): () => void {
    this.watchers.set(clientId, onStep)
    return () => this.watchers.delete(clientId)
  }
  async interrupt(): Promise<void> {
    this.calls.push('interrupt')
  }
  async clearQueue(): Promise<void> {
    this.calls.push('clearQueue')
  }
  async busy(): Promise<boolean> {
    return this.answering && this.queued
  }
  async free(): Promise<void> {
    this.calls.push('free')
  }
}

export class FakeServer {
  starts = 0
  stops = 0
  outsideStops = 0
  /** Whether a started server answers at once; false leaves it starting until the test sets `comfy.answering`. */
  answersOnStart = true
  private exitCb: (() => void) | null = null
  constructor(private readonly comfy: FakeComfy) {}
  async start(): Promise<ServerProcess> {
    this.starts++
    if (this.answersOnStart) this.comfy.answering = true
    return {
      stop: async () => {
        this.stops++
        this.comfy.answering = false
        this.exitCb?.()
      },
      onExit: (cb) => {
        this.exitCb = cb
      }
    }
  }
  async stopOutside(): Promise<void> {
    this.outsideStops++
    this.comfy.answering = false
  }
  /** The server process ends by itself. */
  crash(): void {
    this.comfy.answering = false
    this.exitCb?.()
  }
}

export interface FakeWorker {
  spec: WorkerSpec
  events: WorkerEvents
  killed: boolean
}

export class FakeWorkers {
  runs: FakeWorker[] = []
  /** Each kill is logged into the ComfyUI client's calls, so a test sees it in order with `/interrupt` and the queue clear. */
  constructor(private readonly comfyCalls: string[]) {}
  run(spec: WorkerSpec, events: WorkerEvents): { kill: () => Promise<void> } {
    const worker: FakeWorker = { spec, events, killed: false }
    this.runs.push(worker)
    return {
      kill: async () => {
        worker.killed = true
        this.comfyCalls.push('kill worker')
      }
    }
  }
  last(): FakeWorker {
    const w = this.runs.at(-1)
    if (!w) throw new Error('no worker ran')
    return w
  }
}

export class FakeProcesses {
  names: string[] = []
  /** Pids that have ended; every other pid is alive. */
  ended = new Set<number>()
  /** While true, each `list()` waits until the test answers it through `held`, as a slow tasklist would. */
  hold = false
  held: ((names: string[]) => void)[] = []
  listed = 0
  private listWaiters: { at: number; resolve: () => void }[] = []
  list(): Promise<string[]> {
    this.listed++
    for (const w of this.listWaiters.filter((x) => x.at <= this.listed)) w.resolve()
    this.listWaiters = this.listWaiters.filter((x) => x.at > this.listed)
    if (this.hold) return new Promise((resolve) => this.held.push(resolve))
    return Promise.resolve([...this.names])
  }
  /** Resolves once `list()` has been asked `count` times in all: the handshake for a round that starts while another is held. */
  whenListed(count: number): Promise<void> {
    if (this.listed >= count) return Promise.resolve()
    return new Promise((resolve) => this.listWaiters.push({ at: count, resolve }))
  }
  async alive(pid: number): Promise<boolean> {
    return !this.ended.has(pid)
  }
}

/** The browser: counts each time the app opens the editor's page. */
export class FakeBrowser {
  opened = 0
  async openEditor(): Promise<void> {
    this.opened++
  }
}

/** service.json kept in memory: the heartbeat writes it every 5 s of fake time, and an hour of that on disk is slow. */
export class FakeServiceFile {
  writes: Model3dServiceFile[] = []
  async write(file: Model3dServiceFile): Promise<void> {
    this.writes.push({ ...file })
  }
  last(): Model3dServiceFile {
    const file = this.writes.at(-1)
    if (!file) throw new Error('service.json was never written')
    return file
  }
}

/** The jobs folder kept in memory, as file names and their text, so a test can drop a half-written request too. */
export class FakeJobsFolder implements JobsFolder {
  files = new Map<string, string>()
  async ensure(): Promise<void> {}
  async requests(): Promise<string[]> {
    return requestIds(this.names())
  }
  async readRequest(id: string): Promise<ReadResult> {
    return this.read(requestName(id))
  }
  async readStatus(id: string): Promise<ReadResult> {
    return this.read(statusName(id))
  }
  async writeRequest(id: string, request: Model3dRequest): Promise<void> {
    this.files.set(requestName(id), JSON.stringify(request))
  }
  async writeStatus(id: string, status: Model3dStatus): Promise<void> {
    this.files.set(statusName(id), JSON.stringify(status))
  }
  async remove(id: string): Promise<void> {
    this.files.delete(requestName(id))
    this.files.delete(statusName(id))
  }
  names(): string[] {
    return [...this.files.keys()].sort()
  }
  put(name: string, text: string): void {
    this.files.set(name, text)
  }
  drop(req: Model3dRequest): void {
    this.files.set(requestName(req.id), JSON.stringify(req))
  }
  status(id: string): Model3dStatus | null {
    const text = this.files.get(statusName(id))
    return text === undefined ? null : (JSON.parse(text) as Model3dStatus)
  }
  request(id: string): unknown {
    const text = this.files.get(requestName(id))
    return text === undefined ? null : (JSON.parse(text) as unknown)
  }
  private read(name: string): ReadResult {
    const text = this.files.get(name)
    return text === undefined ? { kind: 'missing' } : parseJsonText(text)
  }
}

export function fakePorts(): {
  ports: Model3dPorts
  clock: FakeClock
  coord: FakeCoord
  comfy: FakeComfy
  server: FakeServer
  workers: FakeWorkers
  processes: FakeProcesses
  serviceFile: FakeServiceFile
  browser: FakeBrowser
  jobs: FakeJobsFolder
  /** What `vetRequest` answers for a request; null lets it run. */
  vet: { answer: (request: Model3dRequest) => string | null }
} {
  const clock = new FakeClock()
  const coord = new FakeCoord(clock)
  const comfy = new FakeComfy()
  const server = new FakeServer(comfy)
  const workers = new FakeWorkers(comfy.calls)
  const processes = new FakeProcesses()
  const serviceFile = new FakeServiceFile()
  const browser = new FakeBrowser()
  const jobs = new FakeJobsFolder()
  const vet = { answer: (_request: Model3dRequest): string | null => null }
  const ports: Model3dPorts = {
    jobs,
    vetRequest: async (r) => vet.answer(r),
    clock,
    coord,
    comfy,
    server,
    workers,
    processes,
    watchFolder: () => () => undefined,
    writeServiceFile: (file) => serviceFile.write(file),
    openEditor: () => browser.openEditor()
  }
  return { ports, clock, coord, comfy, server, workers, processes, serviceFile, browser, jobs, vet }
}

let seq = 0

export function request(patch: Partial<Model3dRequest> = {}): Model3dRequest {
  seq++
  return {
    id: `job${seq}`,
    kind: 'generate',
    argv: ['--image', 'chest.png'],
    cwd: 'C:\\game',
    python: 'C:\\py\\python.exe',
    script: 'C:\\skills\\gen3d.py',
    waiterPid: 4242,
    wait: true,
    sessionId: 'pane-1',
    configDir: '',
    submittedAt: new Date(Date.parse('2026-11-28T09:00:00Z') + seq * 1000).toISOString(),
    summary: `chest${seq}.png, prop`,
    runAnyway: false,
    ...patch
  }
}

