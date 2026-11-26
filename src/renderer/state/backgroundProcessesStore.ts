import { create } from 'zustand'
import type { BackgroundProcess } from '../../shared/backgroundProcesses'
import { localServers, outputTail, type LocalServer } from '../../shared/localPorts'
import { taskOutputOf, type TaskOutput } from './taskOutput'

export const OUTPUT_LINES = 200

export interface ProcessOutput {
  /** The last `OUTPUT_LINES` lines. */
  tail: string
  /** The CLI's last answer as it came, for a terminal that shows it; absent when that fetch failed. */
  raw?: TaskOutput
  /** Fetched after the process ended; no later fetch replaces it. */
  final: boolean
}

interface BackgroundProcessesState {
  /** Each hosted session's background processes, running ones first, as main tracks them. */
  byPane: Record<string, BackgroundProcess[]>
  /** The CLI's error for a Stop that failed, by pane and task id. */
  stopErrors: Record<string, Record<string, string>>
  /** Each process's last fetched output, by pane and task id. */
  outputs: Record<string, Record<string, ProcessOutput>>
  /** The local servers of running processes whose port answered, by pane and task id. */
  servers: Record<string, Record<string, LocalServer[]>>
  initialized: boolean
  init: () => void
  stop: (paneId: string, taskId: string) => Promise<void>
  /** Asks the CLI for a process's output; once it has ended, this is its final fetch. */
  fetchOutput: (paneId: string, taskId: string) => Promise<void>
}

const NO_ERRORS: Record<string, string> = {}
const NO_OUTPUTS: Record<string, ProcessOutput> = {}
const NO_SERVERS: Record<string, LocalServer[]> = {}

const inFlight = new Set<string>()

function processOf(s: BackgroundProcessesState, paneId: string, taskId: string): BackgroundProcess | undefined {
  return s.byPane[paneId]?.find((p) => p.taskId === taskId)
}

function runningServers(servers: Record<string, LocalServer[]> | undefined, processes: readonly BackgroundProcess[]): Record<string, LocalServer[]> | undefined {
  if (!servers) return undefined
  const kept = Object.fromEntries(processes.filter((p) => p.status === 'running' && servers[p.taskId]).map((p) => [p.taskId, servers[p.taskId]]))
  return Object.keys(kept).length > 0 ? kept : undefined
}

export const useBackgroundProcessesStore = create<BackgroundProcessesState>((set, get) => ({
  byPane: {},
  stopErrors: {},
  outputs: {},
  servers: {},
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.backgroundProcesses.onChanged(({ paneId, processes }) =>
      set((s) => {
        const byPane = { ...s.byPane }
        const stopErrors = { ...s.stopErrors }
        const outputs = { ...s.outputs }
        const servers = { ...s.servers }
        if (processes.length > 0) {
          byPane[paneId] = processes
          const kept = runningServers(servers[paneId], processes)
          if (kept) servers[paneId] = kept
          else delete servers[paneId]
        } else {
          delete byPane[paneId]
          delete stopErrors[paneId]
          delete outputs[paneId]
          delete servers[paneId]
        }
        return { byPane, stopErrors, outputs, servers }
      })
    )
    window.api.backgroundProcesses
      .list()
      .then((entries) =>
        set((s) => {
          const byPane = { ...s.byPane }
          for (const e of entries) byPane[e.paneId] ??= e.processes
          return { byPane }
        })
      )
      .catch((err) => console.error('failed to load background processes', err))
  },
  stop: async (paneId, taskId) => {
    const clear = (s: BackgroundProcessesState) => {
      const { [taskId]: _gone, ...rest } = s.stopErrors[paneId] ?? NO_ERRORS
      return { stopErrors: { ...s.stopErrors, [paneId]: rest } }
    }
    set(clear)
    const res = await window.api.claude.control(paneId, 'stop_task', { task_id: taskId })
    // The session may have closed while the stop was in flight.
    if (!res.ok && get().byPane[paneId]) set((s) => ({ stopErrors: { ...s.stopErrors, [paneId]: { ...(s.stopErrors[paneId] ?? NO_ERRORS), [taskId]: res.error } } }))
  },
  fetchOutput: async (paneId, taskId) => {
    const process = processOf(get(), paneId, taskId)
    if (!process || get().outputs[paneId]?.[taskId]?.final) return
    const final = process.status !== 'running'
    // A refresh still in flight when the process ends must not hold up its final fetch.
    const key = `${paneId}\n${taskId}\n${final}`
    if (inFlight.has(key)) return
    inFlight.add(key)
    try {
      const res = await window.api.claude.control(paneId, 'get_task_output', { task_id: taskId })
      const raw = res.ok ? taskOutputOf(res.response) : undefined
      const output = raw?.output
      if (output === undefined && !final) return
      set((s) => {
        const before = s.outputs[paneId]?.[taskId]
        if (!processOf(s, paneId, taskId) || before?.final) return s
        // A failed final fetch keeps the last output, so an ended row is not asked again.
        const kept: ProcessOutput = raw ? { tail: outputTail(raw.output, OUTPUT_LINES), raw, final } : { tail: before?.tail ?? '', ...(before?.raw ? { raw: before.raw } : {}), final }
        return { outputs: { ...s.outputs, [paneId]: { ...(s.outputs[paneId] ?? NO_OUTPUTS), [taskId]: kept } } }
      })
      if (final || output === undefined) return
      const confirmed = new Set((get().servers[paneId]?.[taskId] ?? []).map((server) => server.port))
      const answering = await Promise.all(
        localServers(output)
          .filter((server) => !confirmed.has(server.port))
          .map(async (server) => ((await window.api.backgroundProcesses.portOpen(server.port)) ? server : null))
      )
      const found = answering.filter((server): server is LocalServer => server !== null)
      if (found.length === 0) return
      set((s) => {
        if (processOf(s, paneId, taskId)?.status !== 'running') return s
        const known = s.servers[paneId]?.[taskId] ?? []
        const added = found.filter((server) => !known.some((k) => k.port === server.port))
        return { servers: { ...s.servers, [paneId]: { ...(s.servers[paneId] ?? NO_SERVERS), [taskId]: [...known, ...added] } } }
      })
    } finally {
      inFlight.delete(key)
    }
  }
}))

const NONE: BackgroundProcess[] = []

export function usePaneProcesses(paneId: string): BackgroundProcess[] {
  return useBackgroundProcessesStore((s) => s.byPane[paneId] ?? NONE)
}

export function useStopErrors(paneId: string): Record<string, string> {
  return useBackgroundProcessesStore((s) => s.stopErrors[paneId] ?? NO_ERRORS)
}

export function useProcessOutputs(paneId: string): Record<string, ProcessOutput> {
  return useBackgroundProcessesStore((s) => s.outputs[paneId] ?? NO_OUTPUTS)
}

/** The local servers whose port answered, by task id, for running processes only. */
export function useProcessServers(paneId: string): Record<string, LocalServer[]> {
  return useBackgroundProcessesStore((s) => s.servers[paneId] ?? NO_SERVERS)
}
