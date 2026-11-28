import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Model3dRequest, Model3dServiceFile, Model3dStatus } from '../../shared/model3d'
import type { CoordClaim, Model3dClock, Model3dPorts, ServerProcess, WorkerEvents, WorkerSpec } from './service'

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

export class FakeCoord {
  claimsList: CoordClaim[] = []
  calls: string[] = []
  /** Refuses every claim without listing a holder, as a board whose python fails would. */
  refuse = false
  async claims(): Promise<CoordClaim[]> {
    return this.claimsList.map((c) => ({ ...c }))
  }
  async claim(): Promise<boolean> {
    this.calls.push('claim')
    if (this.refuse) return false
    if (this.claimsList.some((c) => c.job !== 'command-center-3d')) return false
    if (!this.claimsList.some((c) => c.job === 'command-center-3d')) this.claimsList.push({ job: 'command-center-3d', since: Date.now(), why: 'test' })
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
  list(): Promise<string[]> {
    if (this.hold) return new Promise((resolve) => this.held.push(resolve))
    return Promise.resolve([...this.names])
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
} {
  const clock = new FakeClock()
  const coord = new FakeCoord()
  const comfy = new FakeComfy()
  const server = new FakeServer(comfy)
  const workers = new FakeWorkers(comfy.calls)
  const processes = new FakeProcesses()
  const serviceFile = new FakeServiceFile()
  const browser = new FakeBrowser()
  const ports: Model3dPorts = {
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
  return { ports, clock, coord, comfy, server, workers, processes, serviceFile, browser }
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

export async function drop(folder: string, req: Model3dRequest): Promise<void> {
  await fs.writeFile(join(folder, `${req.id}.request.json`), JSON.stringify(req))
}

export async function readStatus(folder: string, id: string): Promise<Model3dStatus | null> {
  try {
    return JSON.parse(await fs.readFile(join(folder, `${id}.status.json`), 'utf8')) as Model3dStatus
  } catch {
    return null
  }
}
