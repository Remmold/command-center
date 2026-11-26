import { beforeEach, describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import { serversNote } from '../../shared/featureServers'
import { profileEnv } from '../../shared/profiles'
import type { PreviewConfig } from '../../shared/previewConfig'
import type { CreateTerminalRequest, CreateTerminalResult, TerminalInfo } from '../../shared/types'
import { createPortReserver } from './ports'
import { completeFeature } from './complete'
import { createServerRunner, type RunnerTerminals } from './serverRunner'

/** A pool that records what it was asked and lets a test end a terminal. */
class FakePool implements RunnerTerminals {
  terminals = new Map<string, TerminalInfo>()
  created: CreateTerminalRequest[] = []
  output = new Map<string, string>()
  refuse: string | null = null
  closeGate: Promise<void> | null = null
  private listeners: ((list: TerminalInfo[]) => void)[] = []
  create(request: CreateTerminalRequest): CreateTerminalResult {
    this.created.push(request)
    if (this.refuse) return { ok: false, error: this.refuse }
    const info: TerminalInfo = { id: request.id!, workspaceId: request.workspaceId, cwd: request.cwd, label: request.label ?? '', command: request.command, kind: request.kind, env: request.env, status: 'running', startedAt: 1 }
    this.terminals.set(info.id, info)
    this.emit()
    return { ok: true, terminal: info }
  }
  async stop(id: string): Promise<void> {
    const t = this.terminals.get(id)
    if (t?.status === 'running') this.terminals.set(id, { ...t, status: 'exited' })
    this.emit()
  }
  async close(id: string): Promise<void> {
    await this.closeGate
    this.terminals.delete(id)
    this.emit()
  }
  list = (): TerminalInfo[] => [...this.terminals.values()]
  attach = (id: string) => (this.terminals.has(id) ? { terminal: this.terminals.get(id)!, tail: this.output.get(id) ?? '' } : null)
  onChanged(cb: (list: TerminalInfo[]) => void): () => void {
    this.listeners.push(cb)
    return () => undefined
  }
  die(id: string, exitCode = 1): void {
    this.terminals.set(id, { ...this.terminals.get(id)!, status: 'exited', exitCode })
    this.emit()
  }
  private emit(): void {
    for (const cb of this.listeners) cb(this.list())
  }
}

const config: PreviewConfig = {
  install: '',
  startPage: '/',
  servers: [
    { name: 'web', command: 'vite --port {port}', cwd: 'web', ready: 'port' },
    { name: 'api', command: 'node server.js', cwd: '.', ready: 'port' }
  ]
}

let pool: FakePool
let records: FeatureRecord[]
let answering: Set<number>
let held: Set<number>
let currentConfig: PreviewConfig | null
let missingWorkspace: string | null
let readyThrows: boolean
let listGate: Promise<void> | null
let removedAccount: string | null

const record = (name: string, extra: Partial<FeatureRecord> = {}): FeatureRecord => ({
  name,
  workspaceId: `ws-${name}`,
  worktreePath: `C:/wt/${name}`,
  branch: `feat/${name}`,
  sessionId: 's',
  ports: [],
  startedAt: 1,
  completedAt: null,
  ...extra
})

function runner(options: { readyTimeoutMs?: number } = {}) {
  const reserver = createPortReserver({
    list: async () => {
      await listGate
      return records
    },
    save: async (name, ports, portNames) => void Object.assign(records.find((r) => r.name === name)!, { ports, portNames }),
    isFree: async (p) => !held.has(p)
  })
  return createServerRunner({
    terminals: pool,
    feature: async (name) => records.find((r) => r.name === name),
    config: async () => currentConfig,
    env: async (workspaceId) =>
      workspaceId === missingWorkspace
        ? { ok: false, error: 'The workspace of this feature was removed, so it would run on the default account.' }
        : workspaceId === removedAccount
          ? { ok: false, error: 'Its account was removed, so it would run on the default login.' }
          : { ok: true, env: profileEnv({ id: workspaceId === 'ws-a' ? 'work' : 'default', configDir: `C:/cfg/${workspaceId}` }, null) },
    reservePorts: reserver.reserve,
    isReady: async (port) => {
      if (readyThrows) throw new Error('socket exploded')
      return answering.has(port)
    },
    shell: 'pwsh',
    pollMs: 5,
    ...options
  })
}

beforeEach(() => {
  pool = new FakePool()
  records = [record('a'), record('b')]
  answering = new Set()
  held = new Set()
  currentConfig = config
  missingWorkspace = null
  readyThrows = false
  listGate = null
  removedAccount = null
})

const portOf = (view: { servers: { name: string; port: number }[] }, server: string): number => view.servers.find((s) => s.name === server)!.port

describe('server runner', () => {
  it('starts each server as a terminal in its worktree folder on its own port, as PORT and as {port}, on the account environment', async () => {
    const r = runner()
    expect(await r.start('a')).toEqual({ ok: true })
    const [web, api] = pool.created
    expect(web).toMatchObject({ id: 'feature-server:a:web', workspaceId: 'ws-a', command: 'vite --port 4100', kind: 'pwsh' })
    expect(web.cwd.replace(/\\/g, '/')).toBe('C:/wt/a/web')
    expect(web.env).toEqual({ CLAUDE_CONFIG_DIR: 'C:/cfg/ws-a', PORT: '4100' })
    expect(api).toMatchObject({ command: 'node server.js' })
    expect(api.env).toMatchObject({ PORT: '4101' })
  })

  it('does not name the account when the feature is on the default account', async () => {
    const r = runner()
    await r.start('b')
    expect(pool.created[0].env).toEqual({ PORT: '4100' })
  })

  it('is Starting, then Ready once the port answers', async () => {
    const r = runner()
    await r.start('a')
    expect(serversNote(r.current('a').servers)).toBe('Starting')
    answering.add(4100)
    answering.add(4101)
    const settled = await r.settled('a')
    expect(settled.servers.map((s) => s.status)).toEqual(['ready', 'ready'])
    expect(serversNote(settled.servers)).toBe('Ready')
  })

  it('fails with output and a reason when a server never answers within the limit, and stops it', async () => {
    const r = runner({ readyTimeoutMs: 40 })
    pool.output.set('feature-server:a:web', '\x1b[31mError: cannot find module\x1b[0m\r\n')
    await r.start('a')
    answering.add(4101)
    const settled = await r.settled('a')
    const web = settled.servers.find((s) => s.name === 'web')!
    expect(web).toMatchObject({ status: 'failed', reason: expect.stringMatching(/did not answer on port 4100 within/), output: 'Error: cannot find module' })
    expect(settled.servers.find((s) => s.name === 'api')!.status).toBe('ready')
    expect(serversNote(settled.servers)).toBe('Failed')
    expect(pool.terminals.get('feature-server:a:web')!.status).toBe('exited')
  })

  it('fails at once when the server cannot start', async () => {
    pool.refuse = 'Could not find shell pwsh on PATH.'
    const r = runner()
    await r.start('a')
    expect(r.current('a').servers.map((s) => [s.status, s.reason])).toEqual([
      ['failed', 'Could not find shell pwsh on PATH.'],
      ['failed', 'Could not find shell pwsh on PATH.']
    ])
  })

  it('fails when the process ends before it answers, and when it dies after it was ready', async () => {
    const r = runner()
    await r.start('a')
    pool.die('feature-server:a:web', 2)
    expect(r.current('a').servers[0]).toMatchObject({ status: 'failed', reason: expect.stringMatching(/ended before it answered.*exit 2/) })
    answering.add(4101)
    await r.settled('a')
    pool.die('feature-server:a:api', 0)
    expect(r.current('a').servers[1]).toMatchObject({ status: 'failed', reason: expect.stringMatching(/stopped after it was ready/) })
  })

  it('retries only the failed server, on the same port', async () => {
    const r = runner({ readyTimeoutMs: 30 })
    answering.add(4101)
    await r.start('a')
    await r.settled('a')
    expect(r.current('a').servers[0].status).toBe('failed')
    const before = pool.created.length
    answering.add(4100)
    expect(await r.retry('a', 'web')).toEqual({ ok: true })
    expect(pool.created).toHaveLength(before + 1)
    expect(pool.created.at(-1)!.command).toBe('vite --port 4100')
    const settled = await r.settled('a')
    expect(settled.servers.map((s) => s.status)).toEqual(['ready', 'ready'])
  })

  it('leaves running servers alone when started again', async () => {
    const r = runner()
    await r.start('a')
    await r.start('a')
    expect(pool.created).toHaveLength(2)
  })

  it('stops every server, shows Stopped, and the feature keeps its ports', async () => {
    const r = runner()
    answering.add(4100)
    answering.add(4101)
    await r.start('a')
    await r.settled('a')
    await r.stop('a')
    expect(r.current('a').servers.map((s) => s.status)).toEqual(['stopped', 'stopped'])
    expect(serversNote(r.current('a').servers)).toBe('Stopped')
    expect(records[0].ports).toEqual([4100, 4101])
    expect([...pool.terminals.values()].map((t) => t.status)).toEqual(['exited', 'exited'])
    await r.start('a')
    expect(pool.created.at(-1)!.env).toMatchObject({ PORT: '4101' })
    expect(pool.created.at(-2)!.env).toMatchObject({ PORT: '4100' })
  })

  it('leaves no process behind when Stop comes while the old terminal is still closing', async () => {
    const r = runner()
    await r.start('a')
    await r.stop('a')
    let open!: () => void
    pool.closeGate = new Promise((resolve) => (open = resolve))
    const created = pool.created.length
    const again = r.start('a')
    await new Promise((resolve) => setTimeout(resolve, 20))
    await r.stop('a')
    open()
    await again
    expect(pool.created).toHaveLength(created)
    expect(r.current('a').servers.map((s) => s.status)).toEqual(['stopped', 'stopped'])
  })

  it('gives two features started at once different ports', async () => {
    const r = runner()
    await Promise.all([r.start('a'), r.start('b')])
    const ports = pool.created.map((c) => c.env!.PORT)
    expect(new Set(ports).size).toBe(4)
  })

  it('refuses a feature without servers, an unknown one and a completed one, with a reason', async () => {
    const r = runner()
    currentConfig = null
    expect(await r.start('a')).toEqual({ ok: false, error: expect.stringMatching(/no preview servers/) })
    expect(await r.start('ghost')).toEqual({ ok: false, error: expect.stringMatching(/not known/) })
    records[1].completedAt = 5
    currentConfig = config
    expect(await r.start('b')).toEqual({ ok: false, error: expect.stringMatching(/completed/) })
    expect(pool.created).toHaveLength(0)
  })

  it('refuses with the allocator reason when the range is used up', async () => {
    const r = runner()
    held = new Set(Array.from({ length: 900 }, (_, i) => 4100 + i))
    expect(await r.start('a')).toEqual({ ok: false, error: expect.stringMatching(/No free port left/) })
  })

  it('refuses a feature whose workspace is gone instead of starting it on the default account', async () => {
    missingWorkspace = 'ws-a'
    const r = runner()
    expect(await r.start('a')).toEqual({ ok: false, error: expect.stringMatching(/workspace of this feature was removed.*not started/) })
    expect(pool.created).toHaveLength(0)
  })

  it('shows a failure inside the ready check as the Failed reason of that server', async () => {
    readyThrows = true
    const r = runner()
    await r.start('a')
    const settled = await r.settled('a')
    expect(settled.servers.map((s) => s.status)).toEqual(['failed', 'failed'])
    expect(settled.servers[0].reason).toMatch(/ready check failed: socket exploded/)
  })

  it('keeps each server on its port when the config reorders or renames servers', async () => {
    const r = runner()
    await r.start('a')
    await r.stop('a')
    currentConfig = { ...config, servers: [config.servers[1], { ...config.servers[0], name: 'front' }] }
    await r.start('a')
    const again = pool.created.slice(-2)
    expect(again.find((c) => c.command === 'node server.js')!.env).toMatchObject({ PORT: '4101' })
    expect(again.find((c) => c.command === 'vite --port 4102')).toBeDefined()
  })

  it('tells listeners about every change', async () => {
    const r = runner()
    const seen: string[] = []
    r.onChanged((name, view) => seen.push(`${name}:${serversNote(view.servers)}`))
    await r.start('a')
    expect(seen.at(-1)).toBe('a:Starting')
    expect(portOf(r.current('a'), 'api')).toBe(4101)
  })

  it('remove kills the servers and closes their terminals, so nothing of the feature is tracked or listed', async () => {
    const r = runner()
    await r.start('a')
    await r.start('b')
    answering.add(4100)
    answering.add(4101)
    await r.settled('a')
    const seen: string[] = []
    r.onChanged((name, view) => seen.push(name + ":" + view.servers.length))
    await r.remove('a')
    expect(r.current('a').servers).toEqual([])
    expect(Object.keys(r.all())).toEqual(['b'])
    expect(pool.list().map((t) => t.id).sort()).toEqual(['feature-server:b:api', 'feature-server:b:web'])
    expect(seen.at(-1)).toBe('a:0')
  })

  it('Complete during a start leaves no running server and no saved ports', async () => {
    let release!: () => void
    listGate = new Promise((resolve) => (release = resolve))
    const r = runner()
    const starting = r.start('a')
    const completing = r.lock.run('a', () =>
      completeFeature(
        {
          feature: async (n) => records.find((f) => f.name === n),
          runner: r,
          closePair: async () => undefined,
          setPorts: async (n, ports, portNames) => void Object.assign(records.find((f) => f.name === n)!, { ports, portNames }),
          setCompleted: async (n, at) => void Object.assign(records.find((f) => f.name === n)!, { completedAt: at }),
          now: () => 9
        },
        'a'
      )
    )
    release()
    await starting
    await completing
    expect(pool.list().filter((t) => t.status === 'running')).toEqual([])
    expect(r.current('a').servers).toEqual([])
    expect(records[0]).toMatchObject({ ports: [], completedAt: 9 })
  })

  it('refuses, naming the account, when its account was removed', async () => {
    removedAccount = 'ws-a'
    const r = runner()
    expect(await r.start('a')).toEqual({ ok: false, error: expect.stringMatching(/account was removed.*not started/) })
    expect(await r.retry('a', 'web')).toEqual({ ok: false, error: expect.stringMatching(/account was removed/) })
    expect(pool.created).toHaveLength(0)
  })

  it('gives a server a fresh port, and says so, when a foreign program took its kept one', async () => {
    const r = runner()
    await r.start('a')
    await r.stop('a')
    held.add(4100)
    const again = await r.start('a')
    expect(again).toEqual({ ok: true, note: expect.stringMatching(/web.*4102/) })
    expect(portOf(r.current('a'), 'web')).toBe(4102)
    expect(portOf(r.current('a'), 'api')).toBe(4101)
    expect(pool.created.at(-2)).toMatchObject({ command: 'vite --port 4102' })
  })

  it('does not take a port from its own running server', async () => {
    const r = runner()
    await r.start('a')
    held.add(4100)
    held.add(4101)
    expect(await r.start('a')).toEqual({ ok: true })
    expect(pool.created).toHaveLength(2)
    expect(portOf(r.current('a'), 'web')).toBe(4100)
  })
})
