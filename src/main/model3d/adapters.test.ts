import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Model3dRequest } from '../../shared/model3d'
import { coordPython, createCoordBoard, createProcessList, listenerPids, model3dScriptDirs, parseCoordClaims, pidAlive, realModel3dPorts, stopOutsideServer, vetWorkerRequest, type Exec, type ExecResult } from './adapters'
import { progressStep, watchComfyMessages } from './comfyWs'
import { model3dConfig } from './config'
import { diskJobsFolder } from './jobsFolder'

describe('a server started outside the app', () => {
  it('is found by the pid listening on its port in netstat, on any address, never a connection to it', () => {
    const netstat = [
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1180',
      '  TCP    127.0.0.1:8189         0.0.0.0:0              LISTENING       5120',
      '  TCP    127.0.0.1:52011        127.0.0.1:8189         ESTABLISHED     9000',
      '  TCP    127.0.0.1:81890        0.0.0.0:0              LISTENING       7000',
      '  TCP    [::]:8189              [::]:0                 LISTENING       5120',
      '  TCP    0.0.0.0:8189           0.0.0.0:0              LISTENING       6000'
    ].join('\r\n')
    expect(listenerPids(netstat, 8189)).toEqual([5120, 6000])
  })
})

describe('the coord board', () => {
  it('skips every call while the script is missing, and then has no claims and takes the claim', async () => {
    const calls: string[][] = []
    const run: Exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      return { code: 0, stdout: '' }
    }
    const board = createCoordBoard(join(tmpdir(), 'no-such-coord', 'coord.py'), run)
    expect(await board.claims()).toEqual({ ok: true, claims: [] })
    expect(await board.claim()).toBe(true)
    await board.unclaim()
    expect(calls).toEqual([])
  })

  it('claims and unclaims gpu as command-center-3d with python -I, and a busy board refuses the claim', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'coord-'))
    const script = join(dir, 'coord.py')
    await fs.writeFile(script, '')
    const calls: string[][] = []
    let code = 0
    const run: Exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      return { code, stdout: '' }
    }
    const board = createCoordBoard(script, run)
    expect(await board.claim()).toBe(true)
    await board.unclaim()
    code = 3
    expect(await board.claim()).toBe(false)
    expect(calls.slice(0, 2)).toEqual([
      ['python', '-I', script, 'claim', 'command-center-3d', 'gpu', 'Command Center 3D server'],
      ['python', '-I', script, 'unclaim', 'command-center-3d', 'gpu']
    ])
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('reads the gpu claims the board prints', () => {
    const out = [
      '2026-11-28 10:27:45Z  {"job": "model3d", "path": "gpu", "why": "gen3d.py run"}',
      '2026-11-28 09:00:00Z  {"job": "boss2", "path": "PATCHES.md", "why": "hunk"}',
      'no claims here'
    ].join('\r\n')
    expect(parseCoordClaims(out)).toEqual([{ job: 'model3d', since: Date.parse('2026-11-28T10:27:45Z'), why: 'gen3d.py run' }])
  })
})

describe('config', () => {
  it('defaults to the real engine and takes env overrides for e2e', () => {
    expect(model3dConfig({}, 'F')).toMatchObject({
      engineDir: 'C:\\ComfyUI3D',
      enginePython: join('C:\\ComfyUI3D', '.venv', 'Scripts', 'python.exe'),
      port: 8189,
      coordScript: 'C:\\dfst_coord\\coord.py',
      clusterProcesses: ['SFGamelogicServer.exe', 'SFGamelogicDistributor.exe'],
      unityProcesses: ['Unity.exe'],
      serverLog: join('C:\\ComfyUI3D', 'server.log')
    })
    const env = { CC_MODEL3D_ENGINE_DIR: 'D:\\fake', CC_MODEL3D_PORT: '9999', CC_MODEL3D_COORD: 'D:\\c.py', CC_MODEL3D_CLUSTER_PROCESSES: 'a.exe, b.exe', CC_MODEL3D_UNITY_PROCESSES: '' }
    expect(model3dConfig(env, 'F')).toMatchObject({ engineDir: 'D:\\fake', port: 9999, coordScript: 'D:\\c.py', clusterProcesses: ['a.exe', 'b.exe'], unityProcesses: [] })
  })
})

describe('ComfyUI /ws progress', () => {
  let server: Server | null = null
  afterEach(() => server?.close())

  const frame = (opcode: number, payload: Buffer): Buffer => {
    const head = payload.length < 126 ? Buffer.from([0x80 | opcode, payload.length]) : Buffer.from([0x80 | opcode, 126, payload.length >> 8, payload.length & 0xff])
    return Buffer.concat([head, payload])
  }

  it('reads the text messages for its client id, skipping binary previews', async () => {
    let path = ''
    server = createServer()
    server.on('upgrade', (req, socket) => {
      path = req.url ?? ''
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
      const long = JSON.stringify({ type: 'status', data: { pad: 'x'.repeat(300) } })
      const progress = frame(1, Buffer.from(JSON.stringify({ type: 'progress', data: { value: 7, max: 30 } })))
      // Split mid-frame, as TCP may.
      const all = Buffer.concat([frame(1, Buffer.from(long)), frame(2, Buffer.from([1, 2, 3])), progress])
      socket.write(all.subarray(0, 50))
      setTimeout(() => socket.write(all.subarray(50)), 20)
    })
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    const port = (server.address() as AddressInfo).port
    const steps: unknown[] = []
    const stop = watchComfyMessages(port, 'abc', (m) => {
      const s = progressStep(m)
      if (s) steps.push(s)
    })
    const deadline = Date.now() + 5000
    while (steps.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
    stop()
    expect(path).toBe('/ws?clientId=abc')
    expect(steps).toEqual([{ step: 7, steps: 30 }])
  })
})

describe('the waiting gen3d.py', () => {
  it('is alive while its pid runs, and gone once it has ended', () => {
    expect(pidAlive(process.pid)).toBe(true)
    const ended = spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid
    expect(pidAlive(ended)).toBe(false)
    expect(pidAlive(0)).toBe(false)
  })
})

describe('service.json', () => {
  it('is written into the jobs folder', async () => {
    const folder = await fs.mkdtemp(join(tmpdir(), 'model3d-service-'))
    const config = model3dConfig({ CC_MODEL3D_PORT: '1', CC_MODEL3D_COORD: join(folder, 'no-coord.py') }, folder)
    const file = { pid: 1, heartbeatAt: '2026-11-28T10:00:00.000Z', server: 'stopped' as const, startedByApp: false }
    await realModel3dPorts(config, async () => undefined).writeServiceFile(file)
    expect(JSON.parse(await fs.readFile(join(folder, 'service.json'), 'utf8'))).toEqual(file)
    await fs.rm(folder, { recursive: true, force: true })
  })
})

describe('opening the editor', () => {
  it("opens http://127.0.0.1:<port> in the browser, or only logs it when e2e points the browser at a file", async () => {
    const folder = await fs.mkdtemp(join(tmpdir(), 'model3d-browser-'))
    const opened: string[] = []
    const open = async (url: string): Promise<void> => void opened.push(url)
    await realModel3dPorts(model3dConfig({ CC_MODEL3D_PORT: '4321' }, folder), open).openEditor()
    expect(opened).toEqual(['http://127.0.0.1:4321'])

    const log = join(folder, 'browser.log')
    const config = model3dConfig({ CC_MODEL3D_PORT: '4321', CC_MODEL3D_BROWSER_LOG: log }, folder)
    expect(config.browserLog).toBe(log)
    await realModel3dPorts(config, open).openEditor()
    expect(opened).toHaveLength(1)
    expect(await fs.readFile(log, 'utf8')).toBe('http://127.0.0.1:4321\n')
    await fs.rm(folder, { recursive: true, force: true })
  })
})

describe('the coord board python', () => {
  it("is the engine venv's python when it exists, else python on PATH", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'coord-py-'))
    const venv = join(dir, 'python.exe')
    await fs.writeFile(venv, '')
    expect(coordPython(venv)).toBe(venv)
    expect(coordPython(join(dir, 'missing', 'python.exe'))).toBe('python')
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('gives the reason a board that cannot be run fails, never an empty list', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'coord-'))
    const script = join(dir, 'coord.py')
    await fs.writeFile(script, '')
    let result: ExecResult = { code: null, stdout: '', stderr: '', error: 'spawn python ENOENT' }
    const board = createCoordBoard(script, async () => result)
    expect(await board.claims()).toEqual({ ok: false, error: 'spawn python ENOENT' })
    result = { code: 9009, stdout: '', stderr: 'Python was not found; run without arguments to install from the Microsoft Store\r\nmore' }
    expect(await board.claims()).toEqual({ ok: false, error: 'Python was not found; run without arguments to install from the Microsoft Store' })
    result = { code: 0, stdout: '2026-11-28 10:27:45Z  {"job": "model3d", "path": "gpu", "why": "run"}', stderr: '' }
    expect(await board.claims()).toEqual({ ok: true, claims: [{ job: 'model3d', since: Date.parse('2026-11-28T10:27:45Z'), why: 'run' }] })
    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('the process list', () => {
  it('lists the image names, and fails with why when tasklist did not run or answer, never an empty list', async () => {
    let result: ExecResult = { code: 0, stdout: '"Unity.exe","123","Console","1","10,000 K"\r\n"python.exe","9","Console","1","5 K"\r\n' }
    const processes = createProcessList(async () => result)
    expect(await processes.list()).toEqual(['Unity.exe', 'python.exe'])
    result = { code: null, stdout: '"Unity.exe","123"', error: 'tasklist did not answer within 30 s' }
    await expect(processes.list()).rejects.toThrow('tasklist did not answer within 30 s')
    result = { code: 1, stdout: '', stderr: 'ERROR: something\r\n' }
    await expect(processes.list()).rejects.toThrow('ERROR: something')
  })
})

describe('stopping a server started outside the app', () => {
  const netstat = [
    '  TCP    127.0.0.1:8189         0.0.0.0:0              LISTENING       5120',
    '  TCP    [::1]:8189             [::]:0                 LISTENING       6000',
    '  TCP    0.0.0.0:8189           0.0.0.0:0              LISTENING       7000'
  ].join('\r\n')
  const processes = JSON.stringify([
    { ProcessId: 5120, Name: 'python.exe', CommandLine: String.raw`C:\ComfyUI3D\.venv\Scripts\python.exe main.py --port 8189` },
    { ProcessId: 6000, Name: 'python3.12.exe', CommandLine: String.raw`"C:\py\python3.12.exe" C:\ComfyUI3D\main.py` },
    { ProcessId: 7000, Name: 'node.exe', CommandLine: 'node main.py' }
  ])

  it('reads netstat for IPv4 and IPv6 and kills only python running main.py on the port', async () => {
    const calls: string[][] = []
    const run: Exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      if (cmd === 'netstat') return { code: 0, stdout: netstat, stderr: '' }
      if (cmd === 'powershell') return { code: 0, stdout: processes, stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    }
    await stopOutsideServer(8189, run)
    expect(calls[0]).toEqual(['netstat', '-ano'])
    expect(calls.filter((c) => c[0] === 'taskkill')).toEqual([
      ['taskkill', '/PID', '5120', '/T', '/F'],
      ['taskkill', '/PID', '6000', '/T', '/F']
    ])
  })

  it('kills nothing when the process list cannot be read', async () => {
    const calls: string[][] = []
    const run: Exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      return cmd === 'netstat' ? { code: 0, stdout: netstat, stderr: '' } : { code: 1, stdout: '', stderr: 'denied' }
    }
    await stopOutsideServer(8189, run)
    expect(calls.filter((c) => c[0] === 'taskkill')).toEqual([])
  })
})

describe('a request that runs a worker', () => {
  let home: string
  let scripts: string
  let cwd: string
  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'model3d-vet-'))
    scripts = join(home, '.claude', 'skills', 'model3d', 'scripts')
    cwd = join(home, 'game')
    await fs.mkdir(scripts, { recursive: true })
    await fs.mkdir(cwd)
    await fs.writeFile(join(scripts, 'gen3d.py'), '')
    await fs.writeFile(join(scripts, 'other.py'), '')
    await fs.mkdir(join(home, 'py'))
    await fs.writeFile(join(home, 'py', 'python.exe'), '')
    await fs.writeFile(join(home, 'py', 'evil.exe'), '')
  })
  afterEach(() => fs.rm(home, { recursive: true, force: true }))

  const vet = (patch: Partial<Model3dRequest>) => vetWorkerRequest({ ...vetRequestBase, script: join(scripts, 'gen3d.py'), cwd, ...patch }, [scripts])

  it('may run gen3d.py from a model3d skill folder with python on PATH or a python*.exe, in an existing folder', async () => {
    expect(await vet({ python: 'python' })).toBeNull()
    expect(await vet({ python: 'py' })).toBeNull()
    expect(await vet({ python: join(home, 'py', 'python.exe') })).toBeNull()
    expect(await vet({ script: join(scripts, '..', 'scripts', 'GEN3D.PY') })).toBeNull()
  })

  it.each([
    ['another script in the skill folder', () => ({ script: join(scripts, 'other.py') }), /script/],
    ['a gen3d.py elsewhere', () => ({ script: join(home, 'gen3d.py') }), /script/],
    ['a python that is not python', () => ({ python: join(home, 'py', 'evil.exe') }), /python/],
    ['a python that does not exist', () => ({ python: join(home, 'py', 'missing', 'python.exe') }), /python/],
    ['a command on PATH that is not python', () => ({ python: 'cmd' }), /python/],
    ['a cwd that does not exist', () => ({ cwd: join(home, 'nowhere') }), /cwd/]
  ])('refuses %s', async (_name, patch, error) => {
    expect(await vet(patch())).toMatch(error)
  })

  it('takes the skill folder of the home account, each account profile and the extra folder e2e names', () => {
    expect(model3dScriptDirs(String.raw`C:\Users\me`, [String.raw`C:\Users\me\.claude`, String.raw`D:\work-claude`], String.raw`C:\Temp\e2e\scripts`)).toEqual([
      join(String.raw`C:\Users\me`, '.claude', 'skills', 'model3d', 'scripts'),
      join(String.raw`D:\work-claude`, 'skills', 'model3d', 'scripts'),
      String.raw`C:\Temp\e2e\scripts`
    ])
  })
})

const vetRequestBase: Model3dRequest = {
  id: 'job1',
  kind: 'generate',
  argv: ['--image', 'chest.png'],
  cwd: '',
  python: 'python',
  script: '',
  waiterPid: 1,
  wait: true,
  sessionId: '',
  configDir: '',
  submittedAt: '2026-11-28T10:00:00.000Z',
  summary: 'chest.png · prop',
  runAnyway: false
}

describe('the jobs folder on disk', () => {
  it('lists request ids, reads missing and half-written files apart, writes statuses atomically and removes a job', async () => {
    const folder = join(await fs.mkdtemp(join(tmpdir(), 'model3d-jobs-')), 'model3d-jobs')
    const jobs = diskJobsFolder(folder)
    await jobs.ensure()
    await fs.writeFile(join(folder, 'a.request.json'), '{"id": "a"}')
    await fs.writeFile(join(folder, 'b.request.json'), '{"id": ')
    await fs.writeFile(join(folder, 'bad name!.request.json'), '{}')
    expect((await jobs.requests()).sort()).toEqual(['a', 'b'])
    expect(await jobs.readRequest('a')).toEqual({ kind: 'ok', value: { id: 'a' } })
    expect(await jobs.readRequest('b')).toEqual({ kind: 'unreadable' })
    expect(await jobs.readStatus('a')).toEqual({ kind: 'missing' })
    const status = { state: 'queued' as const, waitReason: null, progress: null, startedAt: null, endedAt: null, error: null, outputs: [] }
    await Promise.all([jobs.writeStatus('a', status), jobs.writeStatus('a', { ...status, waitReason: 'Waiting: Unity running' })])
    expect(await jobs.readStatus('a')).toMatchObject({ kind: 'ok' })
    expect((await fs.readdir(folder)).filter((n) => n.endsWith('.tmp'))).toEqual([])
    await jobs.remove('a')
    expect((await fs.readdir(folder)).sort()).toEqual(['b.request.json', 'bad name!.request.json'])
    await fs.rm(dirname(folder), { recursive: true, force: true })
  })
})
