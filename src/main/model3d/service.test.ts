import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { MODEL3D_APP_SESSION, type Model3dStatus } from '../../shared/model3d'
import { CHECKING, createModel3dService, IDLE_STOP_MS, STOP_OUTSIDE_FAILED, type Model3dService, type Model3dTimings } from './service'
import { fakePorts, request } from './testFakes'

/** No file is made here: the jobs folder is in memory, and a worker's outputs only need paths. */
const root = join(tmpdir(), 'cc-model3d-service-test')
const folder = join(root, 'model3d-jobs')
let fakes: ReturnType<typeof fakePorts>
let service: Model3dService | null

beforeEach(() => {
  fakes = fakePorts()
  service = null
})
afterEach(() => {
  service?.dispose()
})

async function boot(timings: Partial<Model3dTimings> = {}): Promise<Model3dService> {
  service = createModel3dService(fakes.ports, { folder, pid: 777, clusterProcesses: ['SFGamelogicServer.exe', 'SFGamelogicDistributor.exe'], unityProcesses: ['Unity.exe'], timings })
  await service.start()
  await service.settled()
  return service
}

const drop = (r: ReturnType<typeof request>): void => fakes.jobs.drop(r)
const readStatus = async (id: string): Promise<Model3dStatus | null> => fakes.jobs.status(id)
/** Lets every promise the service set off run, while a held round still waits: the fakes answer without I/O. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** Moves the fake clock on and lets the service finish what that set off. */
async function advance(ms: number): Promise<void> {
  await fakes.clock.advance(ms, () => service?.settled() ?? Promise.resolve())
}

/** Drops a request and lets the next 5 s scan pick it up. */
async function submit(...reqs: ReturnType<typeof request>[]): Promise<void> {
  for (const r of reqs) await drop(r)
  await advance(5000)
}

describe('jobs folder and service.json', () => {
  it('writes service.json on start and as a heartbeat every 5 s', async () => {
    await boot()
    const first = fakes.serviceFile.last()
    expect(first).toEqual({ pid: 777, heartbeatAt: '2026-11-28T10:00:00.000Z', server: 'stopped', startedByApp: false })
    await advance(5000)
    expect(fakes.serviceFile.last().heartbeatAt).toBe('2026-11-28T10:00:05.000Z')
  })
})

describe('a dropped request', () => {
  it('is queued, gets its turn, runs as a worker and ends done with its outputs', async () => {
    await boot()
    const job = request()
    await submit(job)
    const worker = fakes.workers.last()
    expect(worker.spec).toMatchObject({
      python: 'C:\\py\\python.exe',
      args: ['C:\\skills\\gen3d.py', '--image', 'chest.png', '--service-worker'],
      cwd: 'C:\\game'
    })
    const running = await readStatus(job.id)
    expect(running).toMatchObject({ state: 'running', waitReason: null, startedAt: '2026-11-28T10:00:05.000Z', endedAt: null })

    const out = await fs.mkdtemp(join(tmpdir(), 'model3d-out-'))
    onTestFinished(() => fs.rm(out, { recursive: true, force: true }))
    await fs.writeFile(join(out, 'chest.json'), '{"tris": 4000}')
    worker.events.stderr('@@model3d {"item":1,"of":2,"name":"chest","stage":"generate"}')
    fakes.comfy.watchers.get(worker.spec.clientId)?.(7, 30)
    await service!.settled()
    expect((await readStatus(job.id))?.progress).toEqual({ item: 1, of: 2, name: 'chest', stage: 'generate', step: 7, steps: 30 })

    worker.events.stdout(join(out, 'chest.glb'))
    worker.events.stdout(join(out, 'chest_sheet.png'))
    worker.events.stdout(join(out, 'lid.glb'))
    worker.events.exit(0)
    await service!.settled()
    const done = await readStatus(job.id)
    expect(done).toMatchObject({
      state: 'done',
      error: null,
      endedAt: '2026-11-28T10:00:05.000Z',
      outputs: [{ glb: join(out, 'chest.glb'), sheet: join(out, 'chest_sheet.png'), json: join(out, 'chest.json') }, { glb: join(out, 'lid.glb') }]
    })
  })
})

describe('a prompt job', () => {
  it('ends done with its pictures for approval and no models, and keeps them after a restart', async () => {
    await boot()
    const job = request({ argv: ['--prompt', 'iron ore'] })
    await submit(job)
    const worker = fakes.workers.last()
    worker.events.stdout(join(root, 'ore_1_input.png'))
    worker.events.stdout(join(root, 'ore_2_input.png'))
    worker.events.exit(0)
    await service!.settled()
    expect(await readStatus(job.id)).toMatchObject({ state: 'done', error: null, outputs: [], pictures: [join(root, 'ore_1_input.png'), join(root, 'ore_2_input.png')] })

    service!.dispose()
    await boot()
    expect(service!.view().jobs.find((j) => j.request.id === job.id)?.status.pictures).toEqual([join(root, 'ore_1_input.png'), join(root, 'ore_2_input.png')])
  })
})

/** Lets a job's worker finish with one model. */
async function finish(worker = fakes.workers.last(), code = 0, glb = join(root, 'm.glb')): Promise<void> {
  if (code === 0) worker.events.stdout(glb)
  worker.events.exit(code)
  await service!.settled()
}

const storedStatus = (state: string, endedAt = '2026-11-28T09:30:00.000Z'): string =>
  JSON.stringify({ state, waitReason: null, progress: null, startedAt: null, endedAt, error: null, outputs: [] })

describe('the queue', () => {
  it('runs jobs one at a time, oldest submittedAt first, and a job behind another waits with its summary', async () => {
    await boot()
    const older = request({ submittedAt: '2026-11-28T08:00:00.000001+00:00', summary: 'barrel.png, prop' })
    const newer = request({ submittedAt: '2026-11-28T08:00:01+00:00' })
    await submit(newer, older)
    expect(fakes.workers.runs).toHaveLength(1)
    expect(await readStatus(older.id)).toMatchObject({ state: 'running' })
    expect(await readStatus(newer.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: barrel.png, prop running' })

    await finish()
    expect(fakes.workers.runs).toHaveLength(2)
    expect(await readStatus(older.id)).toMatchObject({ state: 'done' })
    expect(await readStatus(newer.id)).toMatchObject({ state: 'running', waitReason: null })
    expect(fakes.server.starts).toBe(1)
  })

  it('writes a failed status for a request that is not valid', async () => {
    await boot()
    fakes.jobs.put('bad.request.json', JSON.stringify({ id: 'bad', kind: 'sculpt' }))
    await advance(5000)
    expect(await readStatus('bad')).toMatchObject({ state: 'failed', error: 'The request is not valid: kind is not generate or editor.' })
    expect(fakes.workers.runs).toHaveLength(0)
  })

  it('keeps the first failed status of a request that is not valid across a restart, so it ages out of the history', async () => {
    await boot()
    fakes.jobs.put('bad.request.json', JSON.stringify({ id: 'bad', kind: 'sculpt' }))
    await advance(5000)
    service!.dispose()
    await advance(60_000)
    await boot()
    expect(await readStatus('bad')).toMatchObject({ state: 'failed', endedAt: '2026-11-28T10:00:05.000Z' })
  })

  it('waits for a request that is not JSON yet, and reads it on the next scan', async () => {
    await boot()
    const job = request()
    fakes.jobs.put(`${job.id}.request.json`, '{"id": ')
    await advance(5000)
    expect(await readStatus(job.id)).toBeNull()
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
  })
})

describe('the server', () => {
  it('claims gpu, then starts the server, and service.json shows it ready and started by the app', async () => {
    const order: string[] = []
    const start = fakes.server.start.bind(fakes.server)
    fakes.ports.server = {
      start: () => {
        order.push(`start (claimed: ${fakes.coord.holds()})`)
        return start()
      },
      stopOutside: () => fakes.server.stopOutside()
    }
    await boot()
    await submit(request())
    expect(order).toEqual(['start (claimed: true)'])
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'ready', startedByApp: true })
  })

  it('shows the server starting until /system_stats answers', async () => {
    fakes.server.answersOnStart = false
    await boot()
    await submit(request())
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'starting' })
    expect(fakes.workers.runs).toHaveLength(0)
    await advance(30_000)
    fakes.comfy.answering = true
    await advance(1000)
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'ready' })
    expect(fakes.workers.runs).toHaveLength(1)
  })

  it('fails the job, stops the server and unclaims when it does not answer within 120 s', async () => {
    fakes.server.answersOnStart = false
    await boot()
    const job = request()
    await submit(job)
    await advance(119_000)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
    await advance(2000)
    expect(await readStatus(job.id)).toMatchObject({ state: 'failed', error: 'The 3D server did not answer within 120 s.' })
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'stopped' })
  })

  it('stops the server and unclaims 10 minutes after the queue empties, not before', async () => {
    await boot()
    await submit(request())
    await finish()
    await advance(9 * 60_000 + 59_000)
    expect(fakes.server.stops).toBe(0)
    expect(fakes.coord.holds()).toBe(true)
    await advance(1000)
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'stopped', startedByApp: false })
  })

  it('never idle-stops while a job runs, keeps the server for the next job, and counts the 10 minutes from the queue emptying', async () => {
    await boot()
    await submit(request())
    await advance(30 * 60_000)
    expect(fakes.server.stops).toBe(0)
    await finish()
    await advance(5 * 60_000)
    await submit(request())
    expect(fakes.server.starts).toBe(1)
    await advance(8 * 60_000)
    await finish()
    await advance(9 * 60_000)
    expect(fakes.server.stops).toBe(0)
    await advance(60_000)
    expect(fakes.server.stops).toBe(1)
  })

  it('starts a fresh server for a job after the idle stop', async () => {
    await boot()
    await submit(request())
    await finish()
    await advance(10 * 60_000)
    await submit(request())
    expect(fakes.server.starts).toBe(2)
    expect(fakes.workers.runs).toHaveLength(2)
    expect(fakes.coord.holds()).toBe(true)
  })

  it('releases the claim when the server ends by itself', async () => {
    await boot()
    await submit(request())
    await finish()
    fakes.server.crash()
    await service!.settled()
    expect(fakes.coord.holds()).toBe(false)
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'stopped' })
  })
})

describe('a server started outside the app', () => {
  it('is used when no other job claims gpu, never idle-stopped, and the claim lasts while the queue has work', async () => {
    fakes.comfy.answering = true
    await boot()
    await submit(request())
    expect(fakes.server.starts).toBe(0)
    expect(fakes.workers.runs).toHaveLength(1)
    expect(fakes.coord.holds()).toBe(true)
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'ready', startedByApp: false })
    await finish()
    expect(fakes.coord.holds()).toBe(false)
    await advance(60 * 60_000)
    expect(fakes.server.stops).toBe(0)
    expect(fakes.comfy.answering).toBe(true)
  })

  it('is not used while another job claims gpu', async () => {
    fakes.comfy.answering = true
    fakes.coord.claimsList.push({ job: 'model3d', since: Date.parse('2026-11-28T10:27:45Z'), why: 'gen3d.py run' })
    await boot()
    const job = request()
    await submit(job)
    expect(fakes.workers.runs).toHaveLength(0)
    expect(await readStatus(job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: gpu claimed by model3d since 10:27' })
  })
})

describe('wait reasons', () => {
  const cluster = (): void => {
    fakes.processes.names = ['blender.exe', 'SFGamelogicDistributor.exe', 'Unity.exe']
    fakes.coord.claimsList.push({ job: 'model3d', since: Date.parse('2026-11-28T10:27:45Z'), why: 'gen3d.py run' })
  }

  it('checks the GPU turn, then the cluster, then Unity, then the coord board, and the first hit is the reason; Blender is no check', async () => {
    await boot()
    const first = request({ summary: 'crate.png, prop' })
    const second = request()
    await submit(first)
    cluster()
    await submit(second)
    expect(await readStatus(second.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: crate.png, prop running' })

    await finish()
    expect(await readStatus(second.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: Darkfall cluster running' })
    fakes.processes.names = ['blender.exe', 'Unity.exe']
    await advance(5000)
    expect(await readStatus(second.id)).toMatchObject({ waitReason: 'Waiting: Unity running' })
    fakes.processes.names = ['blender.exe']
    await advance(5000)
    expect(await readStatus(second.id)).toMatchObject({ waitReason: 'Waiting: gpu claimed by model3d since 10:27' })
    fakes.coord.claimsList = []
    await advance(5000)
    expect(await readStatus(second.id)).toMatchObject({ state: 'running', waitReason: null })
  })

  it("skips the cluster, Unity and coord checks for a request's run-anyway flag", async () => {
    cluster()
    await boot()
    const job = request({ runAnyway: true })
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
  })

  it('runs a waiting job at once on Run anyway, but never before the job that holds the GPU turn', async () => {
    await boot()
    const first = request({ summary: 'crate.png, prop' })
    const waiting = request()
    await submit(first)
    cluster()
    await submit(waiting)
    await service!.runAnyway(waiting.id)
    await service!.settled()
    expect(await readStatus(waiting.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: crate.png, prop running' })
    expect(service!.view().jobs.find((j) => j.request.id === waiting.id)?.request.runAnyway).toBe(true)

    await finish()
    expect(await readStatus(waiting.id)).toMatchObject({ state: 'running' })
  })

  it('drops the turn reason as soon as the turn ends, lets a newer round start the job past a slow process list, and ignores the slow answer when it lands', async () => {
    await boot()
    const first = request({ summary: 'crate.png, prop' })
    const second = request()
    await submit(first)
    await submit(second)
    const status = () => service!.view().jobs.find((j) => j.request.id === second.id)?.status
    expect(status()?.waitReason).toBe('Waiting: crate.png, prop running')

    fakes.processes.hold = true
    const listed = fakes.processes.listed
    const worker = fakes.workers.last()
    worker.events.stdout(join(root, 'm.glb'))
    worker.events.exit(0)
    await fakes.processes.whenListed(listed + 1)
    expect(status()?.waitReason).toBe(CHECKING)
    expect(fakes.processes.held).toHaveLength(1)

    fakes.processes.hold = false
    await fakes.clock.advance(5000)
    await fakes.processes.whenListed(listed + 2)
    await flush()
    expect(status()?.state).toBe('running')
    expect(fakes.workers.runs).toHaveLength(2)

    fakes.processes.held[0]!(['Unity.exe'])
    await service!.settled()
    expect(status()).toMatchObject({ state: 'running', waitReason: null })
    expect(fakes.workers.runs).toHaveLength(2)
  })
})

describe('a check round that does not answer', () => {
  it('says what has not answered after 8 s instead of checking forever, and the job starts once a round answers', async () => {
    await boot()
    const job = request()
    fakes.processes.hold = true
    fakes.coord.hold = true
    await drop(job)
    await fakes.clock.advance(5000)
    await flush()
    const status = () => service!.view().jobs.find((j) => j.request.id === job.id)?.status
    expect(status()?.waitReason).toBe(CHECKING)

    await fakes.clock.advance(8000)
    await flush()
    expect(status()?.waitReason).toBe('Waiting: tasklist and the coord board have not answered in 8 s')

    for (const answer of fakes.coord.held.splice(0)) answer({ ok: true, claims: [] })
    await flush()
    expect(status()?.waitReason).toBe('Waiting: tasklist has not answered in 8 s')

    fakes.processes.hold = false
    fakes.coord.hold = false
    await fakes.clock.advance(5000)
    await flush()
    await flush()
    expect(status()).toMatchObject({ state: 'running', waitReason: null })
    expect(fakes.workers.runs).toHaveLength(1)
  })

  it('is a wait reason when tasklist fails, never an empty process list that lets the job run', async () => {
    fakes.processes.broken = 'tasklist did not answer within 30 s'
    await boot()
    const job = request()
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: tasklist could not be run: tasklist did not answer within 30 s' })
    expect(fakes.workers.runs).toHaveLength(0)

    fakes.processes.broken = null
    await advance(5000)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
  })
})

describe('Cancel', () => {
  it('removes a queued job at once as cancelled, and it never runs', async () => {
    await boot()
    const [first, second] = [request(), request()]
    await submit(first, second)
    expect(await service!.cancel(second.id)).toEqual({ ok: true })
    await service!.settled()
    expect(await readStatus(second.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled in Command Center', endedAt: '2026-11-28T10:00:05.000Z' })
    await finish()
    expect(fakes.workers.runs).toHaveLength(1)
  })

  it('interrupts ComfyUI, kills the worker, clears the queue, sets cancelled and gives the next job its turn', async () => {
    await boot()
    const [first, second] = [request(), request()]
    await submit(first, second)
    const worker = fakes.workers.last()
    expect(await service!.cancel(first.id)).toEqual({ ok: true })
    await service!.settled()
    expect(fakes.comfy.calls).toEqual(['interrupt', 'kill worker', 'clearQueue'])
    expect(await readStatus(first.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled in Command Center' })
    worker.events.exit(1)
    await service!.settled()
    expect(await readStatus(first.id)).toMatchObject({ state: 'cancelled' })
    expect(await readStatus(second.id)).toMatchObject({ state: 'running' })
  })

  it('refuses a job that has already finished', async () => {
    await boot()
    const job = request()
    await submit(job)
    await finish()
    expect(await service!.cancel(job.id)).toEqual({ ok: false, error: 'The job has already finished.' })
    expect(await readStatus(job.id)).toMatchObject({ state: 'done' })
  })
})

describe('orphan drop', () => {
  it('drops a queued job once its waiting gen3d.py has ended, but never a --no-wait job or a running one', async () => {
    await boot()
    const running = request({ waiterPid: 100 })
    const waiting = request({ waiterPid: 200 })
    const noWait = request({ waiterPid: 300, wait: false })
    await submit(running, waiting, noWait)
    await advance(5000)
    expect(await readStatus(waiting.id)).toMatchObject({ state: 'queued' })

    fakes.processes.ended = new Set([100, 200, 300])
    await advance(5000)
    expect(await readStatus(waiting.id)).toMatchObject({ state: 'cancelled', error: 'Dropped: waiting gen3d.py ended' })
    expect(await readStatus(noWait.id)).toMatchObject({ state: 'queued' })
    expect(await readStatus(running.id)).toMatchObject({ state: 'running' })
    await finish()
    expect(await readStatus(running.id)).toMatchObject({ state: 'done' })
    expect(await readStatus(noWait.id)).toMatchObject({ state: 'running' })
  })
})

describe('Stop server', () => {
  it('stops an app-started server at once, before the idle stop, and unclaims', async () => {
    await boot()
    await submit(request())
    await finish()
    expect(await service!.stopServer()).toEqual({ ok: true })
    await service!.settled()
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
    expect(service!.view()).toMatchObject({ server: 'stopped', startedByApp: false })
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'stopped' })
  })

  it('refuses while a job runs and leaves the server and the job alone', async () => {
    await boot()
    const job = request()
    await submit(job)
    expect(await service!.stopServer()).toEqual({ ok: false, error: 'A job is running. Wait for it to finish, then stop the server.' })
    expect(fakes.server.stops).toBe(0)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
  })

  it('stops a server started outside the app too', async () => {
    fakes.comfy.answering = true
    await boot()
    await submit(request())
    await finish()
    expect(await service!.stopServer()).toEqual({ ok: true })
    await service!.settled()
    expect(fakes.server.outsideStops).toBe(1)
    expect(fakes.comfy.answering).toBe(false)
    expect(service!.view()).toMatchObject({ server: 'stopped', startedByApp: false })
  })
})

describe('a refused claim', () => {
  it('keeps the job queued and asks again each 5 s round, never in a loop', async () => {
    fakes.coord.refuse = true
    await boot()
    const job = request()
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: the coord board refused the gpu claim' })
    const asked = fakes.coord.calls.filter((c) => c === 'claim').length
    await advance(5000)
    expect(fakes.coord.calls.filter((c) => c === 'claim').length).toBe(asked + 1)
    expect(fakes.server.starts).toBe(0)
    fakes.coord.refuse = false
    await advance(5000)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
  })
})

describe('a worker that fails', () => {
  it('is failed with the last FAILED line on a non-zero exit', async () => {
    await boot()
    const job = request()
    await submit(job)
    const worker = fakes.workers.last()
    worker.events.stderr('  FAILED chest: generation failed: CUDA out of memory')
    worker.events.stderr('[2/2] lid: pixal/full, 4000 faces')
    worker.events.stderr('@@model3d {"item":2,"of":2,"name":"lid","stage":"render"}')
    await finish(worker, 1)
    expect(await readStatus(job.id)).toMatchObject({ state: 'failed', error: 'FAILED chest: generation failed: CUDA out of memory' })
  })

  it('is failed when a batch made no model, even on exit 0', async () => {
    await boot()
    const job = request()
    await submit(job)
    const worker = fakes.workers.last()
    worker.events.stderr('  FAILED chest: generation failed: bad picture')
    worker.events.exit(0)
    await service!.settled()
    expect(await readStatus(job.id)).toMatchObject({ state: 'failed', error: 'FAILED chest: generation failed: bad picture', outputs: [] })
  })
})

describe('restart cleanup', () => {
  it('cancels what was queued or running, and a request with no status, keeps finished jobs and releases a stale claim', async () => {
    const [queued, running, bare, finished] = [request(), request(), request(), request()]
    for (const r of [queued, running, bare, finished]) await drop(r)
    fakes.jobs.put(`${queued.id}.status.json`, storedStatus('queued'))
    fakes.jobs.put(`${running.id}.status.json`, storedStatus('running'))
    fakes.jobs.put(`${finished.id}.status.json`, storedStatus('done'))
    fakes.coord.claimsList.push({ job: 'command-center-3d', since: 0, why: 'left over' })
    await boot()
    for (const r of [queued, running, bare]) {
      expect(await readStatus(r.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled: app closed', endedAt: '2026-11-28T10:00:00.000Z' })
    }
    expect(await readStatus(finished.id)).toMatchObject({ state: 'done' })
    expect(fakes.coord.holds()).toBe(false)
    await advance(5000)
    expect(fakes.workers.runs).toHaveLength(0)
  })
})

describe('history', () => {
  it('keeps the newest 50 finished jobs and deletes older request and status pairs', async () => {
    for (let i = 0; i < 52; i++) {
      const r = request({ id: `old${String(i).padStart(2, '0')}` })
      await drop(r)
      fakes.jobs.put(`${r.id}.status.json`, storedStatus('done', new Date(Date.parse('2026-11-01T00:00:00Z') + i * 60_000).toISOString()))
    }
    await boot()
    const names = fakes.jobs.names()
    expect(names).not.toContain('old00.request.json')
    expect(names).not.toContain('old01.status.json')
    expect(names).toContain('old02.request.json')
    expect(names.filter((n) => n.endsWith('.status.json'))).toHaveLength(50)

    await submit(request())
    await finish()
    const after = fakes.jobs.names()
    expect(after).not.toContain('old02.status.json')
    expect(after.filter((n) => n.endsWith('.request.json'))).toHaveLength(50)
  })
})

describe('the editor turn', () => {
  const editor = (patch: Partial<ReturnType<typeof request>> = {}) => request({ kind: 'editor', argv: ['ui'], summary: 'editor', wait: false, ...patch })
  const state = (id: string) => service!.view().jobs.find((j) => j.request.id === id)?.status

  it('an editor request takes the GPU turn like a job, starts the server, opens the browser and holds the turn with the idle stop paused until Done with editor', async () => {
    await boot()
    const ui = editor()
    await submit(ui)
    expect(await readStatus(ui.id)).toMatchObject({ state: 'running', waitReason: null })
    expect(fakes.server.starts).toBe(1)
    expect(fakes.coord.holds()).toBe(true)
    expect(fakes.browser.opened).toBe(1)
    expect(fakes.workers.runs).toHaveLength(0)

    const job = request()
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: editor open' })
    await service!.cancel(job.id)
    await advance(IDLE_STOP_MS + 5000)
    expect(fakes.server.stops).toBe(0)
    expect(state(ui.id)?.state).toBe('running')

    expect(await service!.doneWithEditor()).toEqual({ ok: true })
    await service!.settled()
    expect(await readStatus(ui.id)).toMatchObject({ state: 'done', error: null })
    expect(fakes.browser.opened).toBe(1)
    await advance(10 * 60_000)
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
  })
  it('Open editor drops an editor request that queues behind a running job, is refused while one is queued, and opens the browser at its turn', async () => {
    await boot()
    const job = request({ summary: 'crate.png, prop' })
    await submit(job)
    expect(await service!.openEditor()).toEqual({ ok: true })
    await service!.settled()
    const ui = service!.view().jobs.find((j) => j.request.kind === 'editor')!
    expect(fakes.jobs.request(ui.request.id)).toMatchObject({
      kind: 'editor',
      argv: ['ui'],
      sessionId: MODEL3D_APP_SESSION,
      wait: false,
      summary: 'editor'
    })
    expect(await readStatus(ui.request.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: crate.png, prop running' })
    expect(await service!.openEditor()).toEqual({ ok: false, error: 'The editor is already open or queued.' })
    expect(await service!.doneWithEditor()).toEqual({ ok: false, error: 'The editor is not open.' })
    expect(fakes.browser.opened).toBe(0)

    await finish()
    await advance(5000)
    expect(await readStatus(ui.request.id)).toMatchObject({ state: 'running' })
    expect(fakes.browser.opened).toBe(1)
    expect(await service!.stopServer()).toEqual({ ok: false, error: 'The editor is open. Click Done with editor, then stop the server.' })
    expect(service!.view().jobs.filter((j) => j.request.kind === 'editor')).toHaveLength(1)
  })

  it('Cancel on a held editor turn interrupts ComfyUI, clears its queue, ends it cancelled and gives the next job its turn', async () => {
    await boot()
    const ui = editor()
    await submit(ui)
    const job = request()
    await submit(job)
    expect(await service!.cancel(ui.id)).toEqual({ ok: true })
    await service!.settled()
    expect(await readStatus(ui.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled in Command Center' })
    expect(fakes.comfy.calls).toEqual(['interrupt', 'clearQueue'])
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
    expect(fakes.workers.runs).toHaveLength(1)
  })

  it('an editor turn cancelled while the server starts leaves one server start for the next job, which waits for it', async () => {
    fakes.server.answersOnStart = false
    await boot()
    const ui = editor()
    const job = request()
    await submit(ui)
    await submit(job)
    expect(service!.view().server).toBe('starting')
    await service!.cancel(ui.id)
    await service!.settled()
    expect(state(job.id)?.state).toBe('running')
    fakes.comfy.answering = true
    await advance(1000)
    expect(fakes.server.starts).toBe(1)
    expect(fakes.workers.runs).toHaveLength(1)
    expect(fakes.browser.opened).toBe(0)
  })

  it('Done with editor drops "Waiting: editor open" at once, and only a round begun after it may start the next job', async () => {
    await boot()
    const ui = editor()
    const job = request()
    await submit(ui)
    await submit(job)
    expect(state(job.id)?.waitReason).toBe('Waiting: editor open')

    fakes.processes.hold = true
    const listed = fakes.processes.listed
    await service!.doneWithEditor()
    await fakes.processes.whenListed(listed + 1)
    expect(state(job.id)?.waitReason).toBe(CHECKING)
    expect(fakes.processes.held).toHaveLength(1)

    fakes.processes.hold = false
    await fakes.clock.advance(5000)
    await fakes.processes.whenListed(listed + 2)
    await flush()
    expect(state(job.id)?.state).toBe('running')
    fakes.processes.held[0]!(['Unity.exe'])
    await service!.settled()
    expect(state(job.id)).toMatchObject({ state: 'running', waitReason: null })
    expect(fakes.workers.runs).toHaveLength(1)
  })
})

describe('quitting', () => {
  it('cancels running and queued jobs, kills the worker, stops an app-started server and unclaims', async () => {
    await boot()
    const [a, b] = [request(), request()]
    await submit(a, b)
    await service!.shutdown()
    expect(fakes.workers.last().killed).toBe(true)
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
    for (const r of [a, b]) expect(await readStatus(r.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled: app closed' })
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'stopped' })
  })

  it('counts queued and running jobs and an editor turn for the quit question, and cancels the editor turn too', async () => {
    await boot()
    expect(service!.unfinished()).toEqual({ jobs: 0, editor: false })
    const ui = request({ kind: 'editor', argv: ['ui'], summary: 'editor', wait: false })
    const [a, b, done] = [request(), request(), request()]
    await submit(done)
    await finish()
    await submit(ui, a, b)
    expect(service!.unfinished()).toEqual({ jobs: 2, editor: true })
    await service!.shutdown()
    for (const r of [ui, a, b]) expect(await readStatus(r.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled: app closed' })
    expect(await readStatus(done.id)).toMatchObject({ state: 'done' })
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
  })

  it('stops a server that was still starting when the app quit, and leaves no claim', async () => {
    let started: () => void = () => undefined
    const start = fakes.server.start.bind(fakes.server)
    fakes.server.start = () => new Promise((resolve) => (started = () => resolve(start())))
    await boot()
    drop(request())
    await fakes.clock.advance(5000)
    await flush()
    expect(service!.view().server).toBe('starting')
    const quit = service!.shutdown()
    started()
    await quit
    await service!.settled()
    expect(fakes.server.starts).toBe(1)
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
  })
})

describe('the gpu claim over a long run (coord.py drops a gpu claim older than 180 min on the next claim)', () => {
  const MIN = 60_000

  it('is taken afresh before 180 min while the server is up, so another job never gets the gpu under a running job', async () => {
    await boot({ checkMs: MIN, heartbeatMs: MIN })
    drop(request())
    await advance(MIN)
    expect(fakes.workers.runs).toHaveLength(1)
    await advance(185 * MIN)
    expect(fakes.coord.claimAs('darkfall-bake')).toBe(false)
    expect(fakes.coord.holds()).toBe(true)
  })

  it('is taken afresh at each turn start', async () => {
    await boot()
    await submit(request())
    await finish()
    await advance(5 * MIN)
    await submit(request())
    expect(fakes.coord.claimsList).toEqual([expect.objectContaining({ job: 'command-center-3d', since: fakes.clock.now() })])
  })

  it("does not wait on another job's gpu claim older than 180 min", async () => {
    fakes.coord.claimsList.push({ job: 'hero-portraits', since: fakes.clock.now() - 181 * MIN, why: 'left over' })
    await boot()
    const job = request()
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'running' })
    expect(fakes.coord.holds()).toBe(true)
  })
})

describe('a coord board that cannot be run', () => {
  it('is the wait reason, never an empty claims list', async () => {
    fakes.coord.broken = 'spawn python ENOENT'
    await boot()
    const job = request()
    await submit(job)
    expect(await readStatus(job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: coord board could not be run: spawn python ENOENT' })
    expect(fakes.workers.runs).toHaveLength(0)
  })
})

describe('a request whose worker may not run', () => {
  it('is failed with why, and its worker never starts; an editor request runs no worker and is let through', async () => {
    fakes.vet.answer = () => 'script is not gen3d.py in a model3d skill folder'
    await boot()
    const job = request()
    const ui = request({ kind: 'editor', argv: ['ui'], summary: 'editor', wait: false })
    await submit(job, ui)
    expect(await readStatus(job.id)).toMatchObject({ state: 'failed', error: 'The request is not valid: script is not gen3d.py in a model3d skill folder.' })
    expect(fakes.workers.runs).toHaveLength(0)
    expect(await readStatus(ui.id)).toMatchObject({ state: 'running' })
  })
})

describe('a server still answering when the app starts', () => {
  it('has its work interrupted and its queue cleared, shows as outside the app, and keeps the claim until its queue is empty', async () => {
    fakes.comfy.answering = true
    fakes.comfy.queued = true
    fakes.coord.claimsList.push({ job: 'command-center-3d', since: 0, why: 'left over' })
    await boot()
    expect(fakes.comfy.calls).toEqual(['interrupt', 'clearQueue'])
    expect(service!.view()).toMatchObject({ server: 'ready', startedByApp: false })
    expect(fakes.coord.claimsList).toEqual([expect.objectContaining({ job: 'command-center-3d', since: fakes.clock.now() })])
    await advance(10_000)
    expect(fakes.coord.holds()).toBe(true)
    fakes.comfy.queued = false
    await advance(5000)
    expect(fakes.coord.holds()).toBe(false)
    expect(service!.view()).toMatchObject({ server: 'ready', startedByApp: false })
    expect(fakes.server.stops + fakes.server.outsideStops).toBe(0)
  })
})

describe('an outside server', () => {
  it('that ends shows as stopped on the next check', async () => {
    fakes.comfy.answering = true
    await boot()
    await submit(request())
    await finish()
    expect(service!.view().server).toBe('ready')
    fakes.comfy.answering = false
    await advance(5000)
    expect(service!.view()).toMatchObject({ server: 'stopped', startedByApp: false })
    expect(fakes.serviceFile.last()).toMatchObject({ server: 'stopped' })
  })

  it('that still answers after Stop server stays ready, and Stop server says so', async () => {
    fakes.comfy.answering = true
    fakes.ports.server = { start: () => fakes.server.start(), stopOutside: async () => undefined }
    await boot()
    await submit(request())
    await finish()
    expect(await service!.stopServer()).toEqual({ ok: false, error: STOP_OUTSIDE_FAILED })
    await service!.settled()
    expect(service!.view()).toMatchObject({ server: 'ready', startedByApp: false })
  })
})

describe('a stored status of the wrong shape', () => {
  it('is read back with only the fields of the right shape: a model without a glb is dropped', async () => {
    const job = request()
    drop(job)
    fakes.jobs.put(
      `${job.id}.status.json`,
      JSON.stringify({ state: 'done', waitReason: 7, progress: 'half', startedAt: null, endedAt: '2026-11-28T09:30:00.000Z', error: { no: 1 }, outputs: [{}, { glb: 'C:\\out\\a.glb', sheet: 5, json: 'C:\\out\\a.json' }, 'b.glb'] })
    )
    await boot()
    expect(service!.view().jobs[0]?.status).toEqual({
      state: 'done',
      waitReason: null,
      progress: null,
      startedAt: null,
      endedAt: '2026-11-28T09:30:00.000Z',
      error: null,
      outputs: [{ glb: 'C:\\out\\a.glb', json: 'C:\\out\\a.json' }]
    })
  })
})

describe('a batch where some items fail', () => {
  it('ends done with its models, and names the failed items in its error', async () => {
    await boot()
    const job = request()
    await submit(job)
    const worker = fakes.workers.last()
    worker.events.stderr('@@model3d {"item":1,"of":3,"name":"chest","stage":"generate"}')
    worker.events.stdout(join(root, 'chest.glb'))
    worker.events.stderr('  FAILED lid: generation failed: CUDA out of memory')
    worker.events.stdout(join(root, 'barrel.glb'))
    worker.events.exit(0)
    await service!.settled()
    expect(await readStatus(job.id)).toMatchObject({
      state: 'done',
      error: '1 of 3 failed: lid: generation failed: CUDA out of memory',
      outputs: [{ glb: join(root, 'chest.glb') }, { glb: join(root, 'barrel.glb') }]
    })
  })
})
