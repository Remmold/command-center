import { promises as fs } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCoordBoard, parseCoordClaims, type Exec } from './adapters'
import { progressStep, watchComfyMessages } from './comfyWs'
import { model3dConfig } from './config'

describe('the coord board', () => {
  it('skips every call while the script is missing, and then has no claims and takes the claim', async () => {
    const calls: string[][] = []
    const run: Exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      return { code: 0, stdout: '' }
    }
    const board = createCoordBoard(join(tmpdir(), 'no-such-coord', 'coord.py'), run)
    expect(await board.claims()).toEqual([])
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
