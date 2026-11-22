export type BusyEvent =
  | { kind: 'spawned'; paneId: string }
  | { kind: 'sent'; paneId: string; uuid: string }
  | { kind: 'approval-raised'; paneId: string; requestId: string }
  | { kind: 'approval-resolved'; paneId: string; requestId: string }
  /** One parsed stream-json line from the pane's claude process. */
  | { kind: 'claude-event'; paneId: string; event: unknown }
  | { kind: 'exit'; paneId: string }

interface PaneBusy {
  turnRunning: boolean
  approvals: readonly string[]
  /** Prompts on the CLI's stdin it has not begun yet. */
  unstarted: readonly string[]
  /** Of those, the ones the CLI said it queued; only these outlive a turn's result. */
  queued: readonly string[]
}

export type BusyState = Readonly<Record<string, PaneBusy>>

const IDLE: PaneBusy = { turnRunning: false, approvals: [], unstarted: [], queued: [] }

const STARTED_OR_ENDED = new Set(['started', 'completed', 'cancelled', 'discarded', 'refused'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Whether a restart would cut into a chat: a running turn, a waiting approval or a prompt the CLI has not started. */
export function reduceBusy(state: BusyState, event: BusyEvent): BusyState {
  const pane = state[event.paneId] ?? IDLE
  const put = (next: PaneBusy): BusyState => ({ ...state, [event.paneId]: next })
  switch (event.kind) {
    case 'spawned':
    case 'exit':
      return put(IDLE)
    case 'sent':
      return put({ ...pane, turnRunning: true, unstarted: [...pane.unstarted, event.uuid] })
    case 'approval-raised':
      return pane.approvals.includes(event.requestId) ? state : put({ ...pane, approvals: [...pane.approvals, event.requestId] })
    case 'approval-resolved':
      return put({ ...pane, approvals: pane.approvals.filter((id) => id !== event.requestId) })
    case 'claude-event':
      return put(applyLine(pane, event.event))
  }
}

function applyLine(pane: PaneBusy, line: unknown): PaneBusy {
  if (!isRecord(line)) return pane
  const started = (uuid: unknown, turnRunning: boolean): PaneBusy => ({
    ...pane,
    turnRunning,
    unstarted: pane.unstarted.filter((u) => u !== uuid),
    queued: pane.queued.filter((u) => u !== uuid)
  })
  if (line.type === 'result') return { ...pane, turnRunning: false, unstarted: pane.queued }
  if (line.type === 'user' && typeof line.uuid === 'string' && pane.unstarted.includes(line.uuid)) return started(line.uuid, true)
  if (line.type !== 'command_lifecycle' || typeof line.command_uuid !== 'string') return pane
  if (line.state === 'queued' && pane.unstarted.includes(line.command_uuid) && !pane.queued.includes(line.command_uuid)) {
    return { ...pane, queued: [...pane.queued, line.command_uuid] }
  }
  if (typeof line.state === 'string' && STARTED_OR_ENDED.has(line.state)) return started(line.command_uuid, pane.turnRunning || line.state === 'started')
  return pane
}

export function isBusy(pane: PaneBusy | undefined): boolean {
  return !!pane && (pane.turnRunning || pane.approvals.length > 0 || pane.unstarted.length > 0)
}

export function busyPanes(state: BusyState): string[] {
  return Object.keys(state).filter((id) => isBusy(state[id]))
}
