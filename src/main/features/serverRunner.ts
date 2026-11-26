import { join } from 'node:path'
import type { FeatureRecord } from '../../shared/features'
import type { FeatureServerView, FeatureServersView } from '../../shared/featureServers'
import { withoutAnsi } from '../../shared/localPorts'
import { serverCommand, type PreviewConfig } from '../../shared/previewConfig'
import type { CreateTerminalRequest, CreateTerminalResult, TerminalAttachment, TerminalInfo } from '../../shared/types'
import type { PortsResult } from './ports'

export const READY_TIMEOUT_MS = 60_000
const POLL_MS = 250
const OUTPUT_CHARS = 1500

/** The part of the app's terminal pool (ADR 0006) the runner uses. */
export interface RunnerTerminals {
  create: (request: CreateTerminalRequest) => CreateTerminalResult
  stop: (id: string) => Promise<void>
  close: (id: string) => Promise<void>
  list: () => TerminalInfo[]
  attach: (id: string) => TerminalAttachment | null
  onChanged: (cb: (list: TerminalInfo[]) => void) => () => void
}

export interface RunnerDeps {
  terminals: RunnerTerminals
  /** A feature by name; undefined when unknown. */
  feature: (name: string) => Promise<FeatureRecord | undefined>
  /** The preview config the feature uses, through its source workspace; null when there is none. */
  config: (feature: FeatureRecord) => Promise<PreviewConfig | null>
  /** The variables a process needs to run as the feature's account. */
  env: (workspaceId: string) => Promise<Record<string, string>>
  reservePorts: (name: string, count: number) => Promise<PortsResult>
  /** Whether something accepts a connection on the port. */
  isReady: (port: number) => Promise<boolean>
  shell: CreateTerminalRequest['kind']
  readyTimeoutMs?: number
  pollMs?: number
}

export type StartResult = { ok: true } | { ok: false; error: string }

interface Tracked {
  view: FeatureServerView
  /** Bumped by every launch, so a wait that belongs to an earlier launch gives up. */
  run: number
  /** False while an older terminal under the same id is still being closed; its exit is not this launch's. */
  launched: boolean
}

const terminalId = (feature: string, server: string): string => `feature-server:${feature}:${server}`

/**
 * Boots a feature's servers from its preview config, each as a terminal in the app's pool (so output and Stop show in
 * the Processes view), and reports each as Starting, Ready, Failed, or Stopped when the app stopped it.
 */
export function createServerRunner(deps: RunnerDeps) {
  const timeout = deps.readyTimeoutMs ?? READY_TIMEOUT_MS
  const poll = deps.pollMs ?? POLL_MS
  const tracked = new Map<string, Map<string, Tracked>>()
  const listeners: ((name: string, view: FeatureServersView) => void)[] = []
  const settledWaiters: { name: string; resolve: () => void }[] = []

  const viewOf = (name: string): FeatureServersView => ({
    servers: [...(tracked.get(name)?.values() ?? [])].map((t) => withOutput(t.view))
  })

  function withOutput(view: FeatureServerView): FeatureServerView {
    if (view.status !== 'failed') return view
    const tail = deps.terminals.attach(view.terminalId)?.tail ?? ''
    const output = withoutAnsi(tail).replace(/\r/g, '').trim().slice(-OUTPUT_CHARS)
    return output ? { ...view, output } : view
  }

  function changed(name: string): void {
    const view = viewOf(name)
    for (const cb of listeners) cb(name, view)
    if (!view.servers.some((s) => s.status === 'starting')) {
      for (const w of settledWaiters.filter((x) => x.name === name)) w.resolve()
      for (let i = settledWaiters.length - 1; i >= 0; i--) if (settledWaiters[i].name === name) settledWaiters.splice(i, 1)
    }
  }

  function set(name: string, server: string, patch: Partial<FeatureServerView>): void {
    const t = tracked.get(name)?.get(server)
    if (!t) return
    const { reason: _reason, ...rest } = t.view
    t.view = { ...rest, ...patch }
    changed(name)
  }

  const fail = (name: string, server: string, reason: string): void => set(name, server, { status: 'failed', reason })

  async function waitUntilReady(name: string, server: string, port: number, run: number): Promise<void> {
    const deadline = Date.now() + timeout
    const live = (): boolean => {
      const t = tracked.get(name)?.get(server)
      return t?.run === run && t.view.status === 'starting'
    }
    while (live()) {
      if (await deps.isReady(port)) {
        if (live()) set(name, server, { status: 'ready' })
        return
      }
      if (Date.now() >= deadline) {
        if (!live()) return
        fail(name, server, `It did not answer on port ${port} within ${Math.round(timeout / 1000)} seconds.`)
        await deps.terminals.stop(terminalId(name, server))
        return
      }
      await new Promise((r) => setTimeout(r, poll))
    }
  }

  deps.terminals.onChanged((list) => {
    for (const [name, servers] of tracked) {
      for (const [server, t] of servers) {
        if (!t.launched || (t.view.status !== 'starting' && t.view.status !== 'ready')) continue
        const info = list.find((i) => i.id === t.view.terminalId)
        if (info?.status !== 'exited') continue
        const code = info.exitCode === undefined ? '' : ` (exit ${info.exitCode})`
        fail(name, server, t.view.status === 'ready' ? `It stopped after it was ready${code}.` : `It ended before it answered on port ${t.view.port}${code}.`)
      }
    }
  })

  async function launch(feature: FeatureRecord, config: PreviewConfig, index: number, port: number, account: Record<string, string>): Promise<void> {
    const server = config.servers[index]
    const id = terminalId(feature.name, server.name)
    const servers = tracked.get(feature.name) ?? new Map<string, Tracked>()
    tracked.set(feature.name, servers)
    const run = (servers.get(server.name)?.run ?? 0) + 1
    servers.set(server.name, { run, launched: false, view: { name: server.name, port, status: 'starting', terminalId: id } })
    changed(feature.name)
    if (deps.terminals.list().some((t) => t.id === id)) await deps.terminals.close(id)
    // A Stop (or a newer launch) while the old terminal closed must not be followed by a process nobody tracks.
    const mine = tracked.get(feature.name)?.get(server.name)
    if (mine?.run !== run || mine.view.status !== 'starting') return
    const made = deps.terminals.create({
      id,
      workspaceId: feature.workspaceId,
      cwd: join(feature.worktreePath, server.cwd),
      kind: deps.shell,
      label: `${feature.name} · ${server.name}`,
      command: serverCommand(server.command, port),
      env: { ...account, PORT: String(port) }
    })
    mine.launched = true
    if (!made.ok) {
      fail(feature.name, server.name, made.error ?? 'It could not start.')
      return
    }
    void waitUntilReady(feature.name, server.name, port, run)
  }

  /** Starts the servers that are not running (Starting or Ready) on the feature's own ports; returns once launched. */
  async function start(name: string, only?: string): Promise<StartResult> {
    const feature = await deps.feature(name)
    if (!feature) return { ok: false, error: `The feature ${name} is not known.` }
    if (feature.completedAt !== null) return { ok: false, error: `${name} is completed; re-open it before starting its servers.` }
    const config = await deps.config(feature)
    if (!config || config.servers.length === 0) return { ok: false, error: `The workspace of ${name} has no preview servers; set them up in Settings, Preview.` }
    if (only && !config.servers.some((s) => s.name === only)) return { ok: false, error: `${name} has no server called ${only}.` }
    const reserved = await deps.reservePorts(name, config.servers.length)
    if (!reserved.ok) return reserved
    const account = await deps.env(feature.workspaceId)
    const launches: Promise<void>[] = []
    for (const [i, server] of config.servers.entries()) {
      if (only && server.name !== only) continue
      const status = tracked.get(name)?.get(server.name)?.view.status
      if (status === 'starting' || status === 'ready') continue
      launches.push(launch(feature, config, i, reserved.ports[i], account))
    }
    await Promise.all(launches)
    return { ok: true }
  }

  return {
    start: (name: string) => start(name),
    /** Runs one server again, e.g. after it Failed. */
    retry: (name: string, server: string) => start(name, server),
    /** Stops every running server; the feature keeps its ports. */
    async stop(name: string): Promise<void> {
      const servers = tracked.get(name)
      if (!servers) return
      const stopping: Promise<void>[] = []
      for (const [server, t] of servers) {
        if (t.view.status === 'stopped') continue
        const wasRunning = t.view.status === 'starting' || t.view.status === 'ready'
        set(name, server, { status: 'stopped' })
        if (wasRunning) stopping.push(deps.terminals.stop(t.view.terminalId))
      }
      await Promise.all(stopping)
    },
    current: viewOf,
    all: (): Record<string, FeatureServersView> => Object.fromEntries([...tracked.keys()].map((n) => [n, viewOf(n)])),
    /** Resolves once none of the feature's servers is Starting. */
    settled(name: string): Promise<FeatureServersView> {
      if (!viewOf(name).servers.some((s) => s.status === 'starting')) return Promise.resolve(viewOf(name))
      return new Promise((resolve) => settledWaiters.push({ name, resolve: () => resolve(viewOf(name)) }))
    },
    onChanged(cb: (name: string, view: FeatureServersView) => void): () => void {
      listeners.push(cb)
      return () => {
        const at = listeners.indexOf(cb)
        if (at >= 0) listeners.splice(at, 1)
      }
    }
  }
}

export type ServerRunner = ReturnType<typeof createServerRunner>
