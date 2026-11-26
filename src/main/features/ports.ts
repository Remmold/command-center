import { connect, createServer } from 'node:net'

/** The ports the app reserves for features' servers. */
export const PORT_RANGE = { from: 4100, to: 4999 } as const

export type PortsResult = { ok: true; ports: number[] } | { ok: false; error: string }

/** Whether something accepts a connection on the port: the ready check, and one of the two "taken" tests. */
export function portAccepts(port: number, host = '127.0.0.1', timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host })
    const done = (accepted: boolean): void => {
      socket.destroy()
      resolve(accepted)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

function canBind(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen({ port, host }, () => server.close(() => resolve(true)))
  })
}

/** A port is free when nothing accepts a connection on it and it can be bound on this machine right now. */
export async function portIsFree(port: number): Promise<boolean> {
  if (await portAccepts(port)) return false
  return (await canBind(port)) && (await canBind(port, '127.0.0.1'))
}

/** The lowest `count` ports of the range that are neither in `taken` nor refused by `isFree`. */
export async function allocatePorts(count: number, taken: ReadonlySet<number>, isFree: (port: number) => Promise<boolean>): Promise<PortsResult> {
  const ports: number[] = []
  for (let port = PORT_RANGE.from; port <= PORT_RANGE.to && ports.length < count; port++) {
    if (taken.has(port)) continue
    if (await isFree(port)) ports.push(port)
  }
  if (ports.length < count) {
    return { ok: false, error: `No free port left between ${PORT_RANGE.from} and ${PORT_RANGE.to} (${count} needed). Complete a feature or stop the programs holding them.` }
  }
  return { ok: true, ports }
}

interface PortRecord {
  name: string
  ports: number[]
  completedAt: number | null
}

export interface PortReserverDeps {
  list: () => Promise<PortRecord[]>
  save: (name: string, ports: number[]) => Promise<void>
  isFree: (port: number) => Promise<boolean>
}

/**
 * Gives each feature its ports once and keeps them: the feature records are the only memory. Reservations run one at a
 * time and are saved before the next starts, so features started at once never share a port.
 */
export function createPortReserver(deps: PortReserverDeps) {
  let queue: Promise<unknown> = Promise.resolve()
  const reserve = (name: string, count: number): Promise<PortsResult> => {
    const run = async (): Promise<PortsResult> => {
      const records = await deps.list()
      const own = records.find((r) => r.name === name)
      if (!own) return { ok: false, error: `The feature ${name} is not known.` }
      if (own.ports.length >= count) return { ok: true, ports: own.ports.slice(0, count) }
      const taken = new Set(records.filter((r) => r.completedAt === null).flatMap((r) => r.ports))
      const more = await allocatePorts(count - own.ports.length, taken, deps.isFree)
      if (!more.ok) return more
      const ports = [...own.ports, ...more.ports]
      await deps.save(name, ports)
      return { ok: true, ports }
    }
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }
  return { reserve }
}
