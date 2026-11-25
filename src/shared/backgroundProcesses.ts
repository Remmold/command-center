export type BackgroundProcessStatus = 'running' | 'finished' | 'failed' | 'stopped'

export interface BackgroundProcess {
  taskId: string
  /** The Bash call's command, else the task's description. */
  command: string
  status: BackgroundProcessStatus
  startedAt: number
  endedAt?: number
}

interface TrackedProcess {
  taskId: string
  toolUseId?: string
  description: string
  startedAt: number
  status: BackgroundProcessStatus
  endedAt?: number
}

export interface BackgroundProcessesState {
  /** Backgrounded `local_bash` tasks, in start order. */
  listed: readonly TrackedProcess[]
  /** `local_bash` tasks still in the foreground; listed only once backgrounded. */
  foreground: Readonly<Record<string, TrackedProcess>>
  /** Bash commands by tool_use id. */
  commands: Readonly<Record<string, string>>
}

export const NO_BACKGROUND_PROCESSES: BackgroundProcessesState = { listed: [], foreground: {}, commands: {} }

const UPDATE_END: Readonly<Record<string, BackgroundProcessStatus>> = { completed: 'finished', failed: 'failed', killed: 'stopped' }
const NOTIFICATION_END: Readonly<Record<string, BackgroundProcessStatus>> = { completed: 'finished', failed: 'failed', stopped: 'stopped' }

type Line = Record<string, unknown>
const isRecord = (v: unknown): v is Line => typeof v === 'object' && v !== null

/** Folds one stream-json line from the CLI into a session's background processes; an unrelated line returns `state` itself. */
export function reduceBackgroundProcesses(state: BackgroundProcessesState, line: unknown, at: number): BackgroundProcessesState {
  if (!isRecord(line)) return state
  if (line.type === 'assistant') return withCommands(state, line)
  if (line.type !== 'system' || typeof line.task_id !== 'string') return state
  const taskId = line.task_id
  if (line.subtype === 'task_started') return started(state, line, taskId, at)
  if (line.subtype === 'task_updated') {
    const patch = isRecord(line.patch) ? line.patch : {}
    const moved = patch.is_backgrounded === true ? background(state, taskId) : state
    const end = typeof patch.status === 'string' ? UPDATE_END[patch.status] : undefined
    return end ? ended(moved, taskId, end, typeof patch.end_time === 'number' ? patch.end_time : at) : moved
  }
  if (line.subtype === 'task_notification') {
    const end = typeof line.status === 'string' ? NOTIFICATION_END[line.status] : undefined
    return end ? ended(state, taskId, end, at) : state
  }
  return state
}

function withCommands(state: BackgroundProcessesState, line: Line): BackgroundProcessesState {
  const content = isRecord(line.message) && Array.isArray(line.message.content) ? line.message.content : []
  let commands = state.commands
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'tool_use' || block.name !== 'Bash' || typeof block.id !== 'string') continue
    const command = isRecord(block.input) ? block.input.command : undefined
    if (typeof command === 'string' && command !== '') commands = { ...commands, [block.id]: command }
  }
  return commands === state.commands ? state : { ...state, commands }
}

function started(state: BackgroundProcessesState, line: Line, taskId: string, at: number): BackgroundProcessesState {
  if (line.task_type !== 'local_bash' || isKnown(state, taskId)) return state
  const task: TrackedProcess = {
    taskId,
    ...(typeof line.tool_use_id === 'string' ? { toolUseId: line.tool_use_id } : {}),
    description: typeof line.description === 'string' ? line.description : '',
    startedAt: at,
    status: 'running'
  }
  if (line.is_backgrounded === true) return { ...state, listed: [...state.listed, task] }
  return { ...state, foreground: { ...state.foreground, [taskId]: task } }
}

function background(state: BackgroundProcessesState, taskId: string): BackgroundProcessesState {
  const task = state.foreground[taskId]
  if (!task) return state
  return { ...state, listed: [...state.listed, task], foreground: without(state.foreground, taskId) }
}

/** The first end wins; a foreground task that ends is forgotten. */
function ended(state: BackgroundProcessesState, taskId: string, status: BackgroundProcessStatus, endedAt: number): BackgroundProcessesState {
  if (state.foreground[taskId]) return { ...state, foreground: without(state.foreground, taskId) }
  const index = state.listed.findIndex((t) => t.taskId === taskId)
  if (index === -1 || state.listed[index].status !== 'running') return state
  const listed = state.listed.slice()
  listed[index] = { ...listed[index], status, endedAt }
  return { ...state, listed }
}

function isKnown(state: BackgroundProcessesState, taskId: string): boolean {
  return taskId in state.foreground || state.listed.some((t) => t.taskId === taskId)
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _gone, ...rest } = record
  return rest
}

/** The session's background processes, running ones first, each group in start order. */
export function backgroundProcessList(state: BackgroundProcessesState): BackgroundProcess[] {
  const rows = state.listed.map((t): BackgroundProcess => ({
    taskId: t.taskId,
    command: (t.toolUseId !== undefined ? state.commands[t.toolUseId] : undefined) ?? t.description,
    status: t.status,
    startedAt: t.startedAt,
    ...(t.endedAt !== undefined ? { endedAt: t.endedAt } : {})
  }))
  return [...rows.filter((r) => r.status === 'running'), ...rows.filter((r) => r.status !== 'running')]
}

export function runningProcesses(processes: readonly BackgroundProcess[]): BackgroundProcess[] {
  return processes.filter((p) => p.status === 'running')
}

export function runningCount(processes: readonly BackgroundProcess[]): number {
  return runningProcesses(processes).length
}
