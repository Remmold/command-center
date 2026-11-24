import type { SessionStatus } from '../../shared/types'

export type SessionStatusEvent =
  | { kind: 'spawned'; at: number }
  | { kind: 'user-message'; at: number }
  | { kind: 'permission-raised'; requestId: string; at: number }
  | { kind: 'permission-resolved'; requestId: string; at: number }
  /** One parsed stream-json line from the claude process. */
  | { kind: 'claude-event'; event: unknown; at: number }
  | { kind: 'exit'; at: number }
  /** The app saw from the agent's own file that it ended (a handback, an interrupt, the finished mark), though the CLI never reported it. */
  | { kind: 'agent-ended'; taskId: string; at: number }

type WithoutTime<E> = E extends unknown ? Omit<E, 'at'> : never
export type UntimedSessionStatusEvent = WithoutTime<SessionStatusEvent>

export interface SessionStatusState {
  status: SessionStatus
  /** When the current status began; unchanged by events that keep the status. */
  since: number
  pendingRequestIds: readonly string[]
  /** Agents (`local_agent` tasks) still working; the chat keeps running after its result until they end. */
  agents?: readonly string[]
  /** The last turn has its result; set until the next prompt. */
  turnDone?: boolean
}

export function reduceSessionStatus(
  prev: SessionStatusState | null,
  event: SessionStatusEvent
): SessionStatusState {
  const next = reduceTurn(prev, event)
  if (event.kind === 'spawned' || event.kind === 'exit') return next
  const before = prev?.agents ?? []
  const agents = event.kind === 'claude-event' ? applyAgentEvent(before, event.event) : event.kind === 'agent-ended' ? before.filter((id) => id !== event.taskId) : before
  const turnStarts = event.kind === 'user-message' || (event.kind === 'claude-event' && isQueuedPromptStart(event.event))
  const turnDone = event.kind === 'claude-event' && isTurnResult(event.event) ? true : turnStarts ? false : (prev?.turnDone ?? false)
  let status = next.status
  let since = next.since
  if (status === 'your-turn' && agents.length > 0) {
    status = 'running'
    since = prev?.status === 'running' ? prev.since : event.at
  } else if (status === 'running' && turnDone && agents.length === 0 && before.length > 0 && next.pendingRequestIds.length === 0) {
    status = 'your-turn'
    since = event.at
  }
  return { status, since, pendingRequestIds: next.pendingRequestIds, ...(agents.length > 0 ? { agents } : {}), ...(turnDone ? { turnDone } : {}) }
}

function reduceTurn(prev: SessionStatusState | null, event: SessionStatusEvent): SessionStatusState {
  const pending = prev?.pendingRequestIds ?? []
  switch (event.kind) {
    case 'spawned':
      return enter(prev, 'idle', event.at, [])
    case 'exit':
      return enter(prev, 'idle', event.at, [])
    case 'user-message':
      return enter(prev, 'running', event.at, pending)
    case 'claude-event':
      if (isTurnResult(event.event)) return enter(prev, 'your-turn', event.at, pending)
      if (isQueuedPromptStart(event.event) && pending.length === 0) return enter(prev, 'running', event.at, pending)
      return prev ?? enter(null, 'running', event.at, pending)
    case 'agent-ended':
      return prev ?? enter(null, 'idle', event.at, [])
    case 'permission-raised':
      if (pending.includes(event.requestId)) return prev ?? enter(null, 'needs-approval', event.at, pending)
      return enter(prev, 'needs-approval', event.at, [...pending, event.requestId])
    case 'permission-resolved': {
      if (!prev || !pending.includes(event.requestId)) return prev ?? enter(null, 'idle', event.at, [])
      const left = pending.filter((id) => id !== event.requestId)
      if (left.length > 0 || prev.status !== 'needs-approval') return { ...prev, pendingRequestIds: left }
      return enter(prev, 'running', event.at, left)
    }
  }
}

const AGENT_END = new Set(['completed', 'failed', 'killed', 'stopped'])

function applyAgentEvent(agents: readonly string[], line: unknown): readonly string[] {
  if (typeof line !== 'object' || line === null) return agents
  const e = line as { type?: unknown; subtype?: unknown; task_id?: unknown; task_type?: unknown; patch?: { status?: unknown } }
  if (e.type !== 'system' || typeof e.task_id !== 'string') return agents
  const id = e.task_id
  if (e.subtype === 'task_started') return e.task_type === 'local_agent' && !agents.includes(id) ? [...agents, id] : agents
  const ended = e.subtype === 'task_notification' || (e.subtype === 'task_updated' && AGENT_END.has(e.patch?.status as string))
  return ended && agents.includes(id) ? agents.filter((a) => a !== id) : agents
}

function enter(
  prev: SessionStatusState | null,
  status: SessionStatus,
  at: number,
  pendingRequestIds: readonly string[]
): SessionStatusState {
  const since = prev && prev.status === status ? prev.since : at
  return { status, since, pendingRequestIds }
}

function isTurnResult(event: unknown): boolean {
  return typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'result'
}

/** A prompt sent mid-turn waits in the CLI's queue and may start its own turn after the result. */
function isQueuedPromptStart(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false
  const e = event as { type?: unknown; state?: unknown }
  return e.type === 'command_lifecycle' && e.state === 'started'
}
