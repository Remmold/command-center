import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { allocatePorts, createPortReserver, portAccepts, portIsFree, PORT_RANGE } from './ports'

const free = async (): Promise<boolean> => true

interface Rec {
  name: string
  ports: number[]
  completedAt: number | null
}

function reserverOver(all: Rec[], isFree: (p: number) => Promise<boolean> = free) {
  return createPortReserver({
    list: async () => all,
    save: async (name, ports) => void (all.find((r) => r.name === name)!.ports = ports),
    isFree
  })
}

describe('allocatePorts', () => {
  it('hands out the lowest free ports of the reserved range', async () => {
    expect(await allocatePorts(2, new Set(), free)).toEqual({ ok: true, ports: [PORT_RANGE.from, PORT_RANGE.from + 1] })
  })

  it('skips ports the app already reserved for a feature', async () => {
    expect(await allocatePorts(2, new Set([4100, 4101, 4103]), free)).toEqual({ ok: true, ports: [4102, 4104] })
  })

  it('skips ports another program holds right now', async () => {
    const result = await allocatePorts(2, new Set(), async (p) => p !== 4100 && p !== 4102)
    expect(result).toEqual({ ok: true, ports: [4101, 4103] })
  })

  it('refuses with a plain reason when the range is used up', async () => {
    const result = await allocatePorts(1, new Set(), async () => false)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/No free port left between 4100 and 4999/) })
  })

  it('refuses when fewer ports are free than asked for', async () => {
    expect((await allocatePorts(3, new Set(), async (p) => p >= 4998)).ok).toBe(false)
  })
})

describe('createPortReserver', () => {
  it('keeps a feature its ports across calls', async () => {
    const reserver = reserverOver([{ name: 'a', ports: [], completedAt: null }])
    const first = await reserver.reserve('a', 2)
    expect(first).toEqual({ ok: true, ports: [4100, 4101] })
    expect(await reserver.reserve('a', 2)).toEqual(first)
  })

  it('adds ports when the config grew and keeps the old ones', async () => {
    const reserver = reserverOver([{ name: 'a', ports: [4100], completedAt: null }])
    expect(await reserver.reserve('a', 2)).toEqual({ ok: true, ports: [4100, 4101] })
  })

  it('never gives two features the same port, even when started at once', async () => {
    const slow = async (): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, 5))
      return true
    }
    const reserver = reserverOver(
      [
        { name: 'a', ports: [], completedAt: null },
        { name: 'b', ports: [], completedAt: null }
      ],
      slow
    )
    const [a, b] = await Promise.all([reserver.reserve('a', 2), reserver.reserve('b', 2)])
    expect(a.ok && b.ok).toBe(true)
    const ports = [...(a.ok ? a.ports : []), ...(b.ok ? b.ports : [])]
    expect(new Set(ports).size).toBe(4)
  })

  it('does not count the ports of a completed feature as taken', async () => {
    const reserver = reserverOver([
      { name: 'done', ports: [4100], completedAt: 5 },
      { name: 'a', ports: [], completedAt: null }
    ])
    expect(await reserver.reserve('a', 1)).toEqual({ ok: true, ports: [4100] })
  })

  it('refuses an unknown feature', async () => {
    expect((await reserverOver([]).reserve('ghost', 1)).ok).toBe(false)
  })
})

describe('real sockets', () => {
  let server: Server | undefined
  afterEach(
    () =>
      new Promise<void>((resolve) => {
        if (server?.listening) server.close(() => resolve())
        else resolve()
      })
  )
  const listen = (): Promise<number> =>
    new Promise((resolve) => {
      server = createServer().listen(0, '127.0.0.1', () => resolve((server!.address() as { port: number }).port))
    })

  it('sees a port with a listener as accepting and not free', async () => {
    const port = await listen()
    expect(await portAccepts(port)).toBe(true)
    expect(await portIsFree(port)).toBe(false)
  })

  it('sees a port nobody listens on as free and not accepting', async () => {
    const port = await listen()
    await new Promise<void>((r) => server!.close(() => r()))
    expect(await portAccepts(port)).toBe(false)
    expect(await portIsFree(port)).toBe(true)
  })
})
