import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createModel3dService, type Model3dService } from './service'
import { drop, fakePorts, readService, readStatus, request } from './testFakes'

let root: string
let folder: string
let fakes: ReturnType<typeof fakePorts>
let service: Model3dService | null

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'model3d-'))
  folder = join(root, 'model3d-jobs')
  fakes = fakePorts()
  service = null
})
afterEach(async () => {
  service?.dispose()
  await fs.rm(root, { recursive: true, force: true })
})

async function boot(): Promise<Model3dService> {
  service = createModel3dService(fakes.ports, { folder, pid: 777, clusterProcesses: ['SFGamelogicServer.exe', 'SFGamelogicDistributor.exe'], unityProcesses: ['Unity.exe'] })
  await service.start()
  await service.settled()
  return service
}

/** Moves the fake clock on and lets the service finish what that set off. */
async function advance(ms: number): Promise<void> {
  await fakes.clock.advance(ms, () => service?.settled() ?? Promise.resolve())
}

/** Drops a request and lets the next 5 s scan pick it up. */
async function submit(...reqs: ReturnType<typeof request>[]): Promise<void> {
  for (const r of reqs) await drop(folder, r)
  await advance(5000)
}

describe('jobs folder and service.json', () => {
  it('creates the jobs folder on start and writes service.json with a heartbeat every 5 s', async () => {
    await boot()
    const first = await readService(folder)
    expect(first).toEqual({ pid: 777, heartbeatAt: '2026-11-28T10:00:00.000Z', server: 'stopped', startedByApp: false })
    await advance(5000)
    expect((await readService(folder)).heartbeatAt).toBe('2026-11-28T10:00:05.000Z')
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
    const running = await readStatus(folder, job.id)
    expect(running).toMatchObject({ state: 'running', waitReason: null, startedAt: '2026-11-28T10:00:05.000Z', endedAt: null })

    const out = join(root, 'out')
    await fs.mkdir(out)
    await fs.writeFile(join(out, 'chest.json'), '{"tris": 4000}')
    worker.events.stderr('@@model3d {"item":1,"of":2,"name":"chest","stage":"generate"}')
    fakes.comfy.watchers.get(worker.spec.clientId)?.(7, 30)
    await service!.settled()
    expect((await readStatus(folder, job.id))?.progress).toEqual({ item: 1, of: 2, name: 'chest', stage: 'generate', step: 7, steps: 30 })

    worker.events.stdout(join(out, 'chest.glb'))
    worker.events.stdout(join(out, 'chest_sheet.png'))
    worker.events.stdout(join(out, 'lid.glb'))
    worker.events.exit(0)
    await service!.settled()
    const done = await readStatus(folder, job.id)
    expect(done).toMatchObject({
      state: 'done',
      error: null,
      endedAt: '2026-11-28T10:00:05.000Z',
      outputs: [{ glb: join(out, 'chest.glb'), sheet: join(out, 'chest_sheet.png'), json: join(out, 'chest.json') }, { glb: join(out, 'lid.glb') }]
    })
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
    expect(await readStatus(folder, older.id)).toMatchObject({ state: 'running' })
    expect(await readStatus(folder, newer.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: barrel.png, prop running' })

    await finish()
    expect(fakes.workers.runs).toHaveLength(2)
    expect(await readStatus(folder, older.id)).toMatchObject({ state: 'done' })
    expect(await readStatus(folder, newer.id)).toMatchObject({ state: 'running', waitReason: null })
    expect(fakes.server.starts).toBe(1)
  })

  it('writes a failed status for a request that is not valid, and leaves no temp files behind', async () => {
    await boot()
    await fs.writeFile(join(folder, 'bad.request.json'), JSON.stringify({ id: 'bad', kind: 'sculpt' }))
    await advance(5000)
    expect(await readStatus(folder, 'bad')).toMatchObject({ state: 'failed', error: 'The request is not valid: kind is not generate or editor.' })
    expect((await fs.readdir(folder)).filter((n) => n.endsWith('.tmp'))).toEqual([])
    expect(fakes.workers.runs).toHaveLength(0)
  })

  it('keeps the first failed status of a request that is not valid across a restart, so it ages out of the history', async () => {
    await boot()
    await fs.writeFile(join(folder, 'bad.request.json'), JSON.stringify({ id: 'bad', kind: 'sculpt' }))
    await advance(5000)
    service!.dispose()
    await advance(60_000)
    await boot()
    expect(await readStatus(folder, 'bad')).toMatchObject({ state: 'failed', endedAt: '2026-11-28T10:00:05.000Z' })
  })

  it('waits for a request that is not JSON yet, and reads it on the next scan', async () => {
    await boot()
    const job = request()
    await fs.writeFile(join(folder, `${job.id}.request.json`), '{"id": ')
    await advance(5000)
    expect(await readStatus(folder, job.id)).toBeNull()
    await submit(job)
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'running' })
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
      }
    }
    await boot()
    await submit(request())
    expect(order).toEqual(['start (claimed: true)'])
    expect(await readService(folder)).toMatchObject({ server: 'ready', startedByApp: true })
  })

  it('shows the server starting until /system_stats answers', async () => {
    fakes.server.answersOnStart = false
    await boot()
    await submit(request())
    expect(await readService(folder)).toMatchObject({ server: 'starting' })
    expect(fakes.workers.runs).toHaveLength(0)
    await advance(30_000)
    fakes.comfy.answering = true
    await advance(1000)
    expect(await readService(folder)).toMatchObject({ server: 'ready' })
    expect(fakes.workers.runs).toHaveLength(1)
  })

  it('fails the job, stops the server and unclaims when it does not answer within 120 s', async () => {
    fakes.server.answersOnStart = false
    await boot()
    const job = request()
    await submit(job)
    await advance(119_000)
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'running' })
    await advance(2000)
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'failed', error: 'The 3D server did not answer within 120 s.' })
    expect(fakes.server.stops).toBe(1)
    expect(fakes.coord.holds()).toBe(false)
    expect(await readService(folder)).toMatchObject({ server: 'stopped' })
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
    expect(await readService(folder)).toMatchObject({ server: 'stopped', startedByApp: false })
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
    expect(await readService(folder)).toMatchObject({ server: 'stopped' })
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
    expect(await readService(folder)).toMatchObject({ server: 'ready', startedByApp: false })
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
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: gpu claimed by model3d since 10:27' })
  })
})

describe('a refused claim', () => {
  it('keeps the job queued and asks again each 5 s round, never in a loop', async () => {
    fakes.coord.refuse = true
    await boot()
    const job = request()
    await submit(job)
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'queued', waitReason: 'Waiting: the coord board refused the gpu claim' })
    const asked = fakes.coord.calls.filter((c) => c === 'claim').length
    await advance(5000)
    expect(fakes.coord.calls.filter((c) => c === 'claim').length).toBe(asked + 1)
    expect(fakes.server.starts).toBe(0)
    fakes.coord.refuse = false
    await advance(5000)
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'running' })
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
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'failed', error: 'FAILED chest: generation failed: CUDA out of memory' })
  })

  it('is failed when a batch made no model, even on exit 0', async () => {
    await boot()
    const job = request()
    await submit(job)
    const worker = fakes.workers.last()
    worker.events.stderr('  FAILED chest: generation failed: bad picture')
    worker.events.exit(0)
    await service!.settled()
    expect(await readStatus(folder, job.id)).toMatchObject({ state: 'failed', error: 'FAILED chest: generation failed: bad picture', outputs: [] })
  })
})

describe('restart cleanup', () => {
  it('cancels what was queued or running, and a request with no status, keeps finished jobs and releases a stale claim', async () => {
    await fs.mkdir(folder, { recursive: true })
    const [queued, running, bare, finished] = [request(), request(), request(), request()]
    for (const r of [queued, running, bare, finished]) await drop(folder, r)
    await fs.writeFile(join(folder, `${queued.id}.status.json`), storedStatus('queued'))
    await fs.writeFile(join(folder, `${running.id}.status.json`), storedStatus('running'))
    await fs.writeFile(join(folder, `${finished.id}.status.json`), storedStatus('done'))
    fakes.coord.claimsList.push({ job: 'command-center-3d', since: 0, why: 'left over' })
    await boot()
    for (const r of [queued, running, bare]) {
      expect(await readStatus(folder, r.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled: app closed', endedAt: '2026-11-28T10:00:00.000Z' })
    }
    expect(await readStatus(folder, finished.id)).toMatchObject({ state: 'done' })
    expect(fakes.coord.holds()).toBe(false)
    await advance(5000)
    expect(fakes.workers.runs).toHaveLength(0)
  })
})

describe('history', () => {
  it('keeps the newest 50 finished jobs and deletes older request and status pairs', async () => {
    await fs.mkdir(folder, { recursive: true })
    for (let i = 0; i < 52; i++) {
      const r = request({ id: `old${String(i).padStart(2, '0')}` })
      await drop(folder, r)
      await fs.writeFile(join(folder, `${r.id}.status.json`), storedStatus('done', new Date(Date.parse('2026-11-01T00:00:00Z') + i * 60_000).toISOString()))
    }
    await boot()
    const names = await fs.readdir(folder)
    expect(names).not.toContain('old00.request.json')
    expect(names).not.toContain('old01.status.json')
    expect(names).toContain('old02.request.json')
    expect(names.filter((n) => n.endsWith('.status.json'))).toHaveLength(50)

    await submit(request())
    await finish()
    const after = await fs.readdir(folder)
    expect(after).not.toContain('old02.status.json')
    expect(after.filter((n) => n.endsWith('.request.json'))).toHaveLength(50)
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
    for (const r of [a, b]) expect(await readStatus(folder, r.id)).toMatchObject({ state: 'cancelled', error: 'Cancelled: app closed' })
    expect(await readService(folder)).toMatchObject({ server: 'stopped' })
  })
})
