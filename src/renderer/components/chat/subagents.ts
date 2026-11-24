import { AGENT_TOOLS } from '../../../shared/agentSummary'
import type { ChatItem, ToolResultItem } from './types'

export { AGENT_TOOLS }
/** SendMessage wakes an agent under its own id. */
const GROUP_TOOLS: ReadonlySet<string> = new Set([...AGENT_TOOLS, 'SendMessage'])

/** The extension's agent states (`FE`) and its wording for each, plus `ended`: gone quiet without a report. */
export type AgentStatus = 'working' | 'finished' | 'failed' | 'stopped' | 'ended'

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  working: 'Working',
  finished: 'Finished',
  failed: 'Failed',
  stopped: 'Stopped',
  ended: 'Ended (no final report)'
}

export interface SubagentTask {
  taskId: string
  toolUseId?: string
  description: string
  subagentType?: string
  prompt?: string
  isBackgrounded?: boolean
  status: AgentStatus
  startTime: number
  endTime?: number
  /** The latest task event for it. */
  lastEventAt?: number
  usage?: { totalTokens: number; toolUses: number; durationMs: number }
  lastToolName?: string
  summary?: string
  error?: string
}

/** A pane's agent tasks by task id; the task id is also the agent id its transcript file is named after. */
export type SubagentTasks = Readonly<Record<string, SubagentTask>>

export interface SubagentGroups {
  main: ChatItem[]
  /** Each group call's subagent items, in arrival order; a nested agent's call sits in its parent's list. */
  byCall: Map<string, ChatItem[]>
}

export function parentOf(item: ChatItem): string | undefined {
  return item.kind === 'assistant' || item.kind === 'tool_result' ? item.parentToolUseId : undefined
}

export function groupSubagents(items: readonly ChatItem[]): SubagentGroups {
  const groupCalls = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'assistant') continue
    for (const block of item.content) {
      if (block.type === 'tool_use' && typeof block.id === 'string' && GROUP_TOOLS.has(block.name as string)) groupCalls.add(block.id)
    }
  }
  const main: ChatItem[] = []
  const byCall = new Map<string, ChatItem[]>()
  for (const item of items) {
    const parent = parentOf(item)
    if (parent === undefined || !groupCalls.has(parent)) {
      main.push(item)
      continue
    }
    const list = byCall.get(parent)
    if (list) list.push(item)
    else byCall.set(parent, [item])
  }
  return { main, byCall }
}

type TaskEvent = { type?: unknown; subtype?: unknown; [key: string]: unknown }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

function usageOf(v: unknown): SubagentTask['usage'] {
  if (!v || typeof v !== 'object') return undefined
  const u = v as Record<string, unknown>
  if (typeof u.total_tokens !== 'number') return undefined
  return { totalTokens: u.total_tokens, toolUses: Number(u.tool_uses) || 0, durationMs: Number(u.duration_ms) || 0 }
}

/** The CLI's end states as the extension's `Zj` reads them. */
function endStatus(status: unknown): AgentStatus | undefined {
  switch (status) {
    case 'completed':
      return 'finished'
    case 'failed':
      return 'failed'
    case 'killed':
    case 'stopped':
      return 'stopped'
    default:
      return undefined
  }
}

/** Folds one `system/task_*` event into the pane's agent tasks; anything else, or a task that is no agent, leaves them as they are. */
export function applyTaskEvent(tasks: SubagentTasks, event: TaskEvent, now: number): SubagentTasks {
  if (event.type !== 'system') return tasks
  const taskId = str(event.task_id)
  if (!taskId) return tasks
  const known = tasks[taskId]
  switch (event.subtype) {
    case 'task_started': {
      if (event.task_type !== undefined && event.task_type !== 'local_agent') return tasks
      const task: SubagentTask = {
        taskId,
        toolUseId: str(event.tool_use_id) ?? known?.toolUseId,
        description: str(event.description) ?? 'Agent',
        subagentType: str(event.subagent_type),
        prompt: str(event.prompt),
        isBackgrounded: typeof event.is_backgrounded === 'boolean' ? event.is_backgrounded : undefined,
        status: 'working',
        startTime: now,
        lastEventAt: now
      }
      return { ...tasks, [taskId]: task }
    }
    case 'task_progress': {
      if (!known) return tasks
      return { ...tasks, [taskId]: { ...known, lastEventAt: now, usage: usageOf(event.usage) ?? known.usage, lastToolName: str(event.last_tool_name) ?? known.lastToolName, summary: str(event.summary) ?? known.summary } }
    }
    case 'task_notification': {
      if (!known) return tasks
      return {
        ...tasks,
        [taskId]: { ...known, status: endStatus(event.status) ?? 'finished', summary: str(event.summary) ?? known.summary, usage: usageOf(event.usage) ?? known.usage, endTime: known.endTime ?? now }
      }
    }
    case 'task_updated': {
      if (!known || !event.patch || typeof event.patch !== 'object') return tasks
      const patch = event.patch as Record<string, unknown>
      const status = endStatus(patch.status)
      const next: SubagentTask = {
        ...known,
        ...(status ? { status, endTime: typeof patch.end_time === 'number' ? patch.end_time : (known.endTime ?? now) } : {}),
        ...(str(patch.error) ? { error: str(patch.error) } : {}),
        ...(typeof patch.is_backgrounded === 'boolean' ? { isBackgrounded: patch.is_backgrounded } : {})
      }
      return { ...tasks, [taskId]: next }
    }
    default:
      return tasks
  }
}

/** As the extension when its process ends: agents still working are stopped. */
export function endTasks(tasks: SubagentTasks, now: number): SubagentTasks {
  let out: Record<string, SubagentTask> | undefined
  for (const [id, task] of Object.entries(tasks)) {
    if (task.status !== 'working') continue
    out ??= { ...tasks }
    out[id] = { ...task, status: 'stopped', endTime: now }
  }
  return out ?? tasks
}

export function taskForCall(tasks: SubagentTasks, toolUseId: string): SubagentTask | undefined {
  return Object.values(tasks).find((t) => t.toolUseId === toolUseId)
}

export interface AgentState {
  status: AgentStatus
  task?: SubagentTask
}

/** The CLI answers a background Agent call at once; that receipt says nothing about how the agent ended. */
const BACKGROUND_RECEIPT = 'Async agent launched'

export function isBackgroundReceipt(result: ToolResultItem): boolean {
  const content = result.content
  const first = typeof content === 'string' ? content : Array.isArray(content) ? (content[0] as { text?: unknown } | undefined)?.text : undefined
  return typeof first === 'string' && first.startsWith(BACKGROUND_RECEIPT)
}

/** A known task decides; without one (a resumed chat) the call's result does, and a call without one is working only while its process runs. */
export function agentStatus(toolUseId: string, tasks: SubagentTasks, result: ToolResultItem | undefined, running: boolean): AgentState {
  const task = taskForCall(tasks, toolUseId)
  if (task) return { status: task.status, task }
  if (!result || (!result.isError && isBackgroundReceipt(result))) return { status: running ? 'working' : 'stopped' }
  return { status: result.isError ? 'failed' : 'finished' }
}

/** The extension's `p9`: whole seconds, then minutes and seconds. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
