/** Foreground tasks the CLI could still move to the background: task id to the tool call it runs (the extension's `foregroundCalls`). */
export type ForegroundCalls = ReadonlyMap<string, string>

/** Tools whose running call offers "Run in background" (the extension's `HZt`). */
export const BACKGROUNDABLE_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell', 'Agent', 'Task'])

export const RUN_IN_BACKGROUND = 'Run in background'

/** The CLI's error when the session refuses background tasks. */
export const BACKGROUND_DISABLED = 'Background tasks are disabled in this session.'

const MOVABLE_TYPES: ReadonlySet<string> = new Set(['local_bash', 'local_agent'])
const END_STATES: ReadonlySet<unknown> = new Set(['completed', 'failed', 'killed'])

type TaskEvent = { type?: unknown; subtype?: unknown; [key: string]: unknown }

function without(calls: ForegroundCalls, taskId: string): ForegroundCalls {
  if (!calls.has(taskId)) return calls
  const next = new Map(calls)
  next.delete(taskId)
  return next
}

/** Folds one `system/task_*` event in, as the extension's `Mje`/`Pje`/`nq`. */
export function applyForegroundEvent(calls: ForegroundCalls, event: TaskEvent): ForegroundCalls {
  if (event.type !== 'system' || typeof event.task_id !== 'string') return calls
  const taskId = event.task_id
  switch (event.subtype) {
    case 'task_started': {
      const toolUseId = event.tool_use_id
      const movable =
        event.is_backgrounded === false && event.skip_transcript !== true && typeof toolUseId === 'string' && MOVABLE_TYPES.has(event.task_type as string)
      if (!movable) return without(calls, taskId)
      if (calls.get(taskId) === toolUseId) return calls
      return new Map(calls).set(taskId, toolUseId)
    }
    case 'task_updated': {
      const patch = (event.patch ?? {}) as Record<string, unknown>
      return patch.is_backgrounded === true || END_STATES.has(patch.status) ? without(calls, taskId) : calls
    }
    case 'task_notification':
      return without(calls, taskId)
    default:
      return calls
  }
}

/** The asked call ids that are running in the foreground (`vme`). */
export function foregroundIds(calls: ForegroundCalls, ids: readonly string[]): string[] {
  if (calls.size === 0) return []
  const running = new Set(calls.values())
  return ids.filter((id) => running.has(id))
}

export type BackgroundOutcome = 'moved' | 'not_found' | 'disabled' | 'failed'

export interface ControlReply {
  ok: boolean
  response?: unknown
  error?: string
}

/** One outcome for the `background_tasks` replies of a click, as the extension's `runInBackground`. */
export function backgroundOutcome(replies: readonly ControlReply[]): BackgroundOutcome {
  const read = replies.map((r) => {
    if (r.ok) {
      const backgrounded = (r.response as { backgrounded?: unknown } | undefined)?.backgrounded
      return { backgrounded: typeof backgrounded === 'boolean' ? backgrounded : true, disabled: false, error: false }
    }
    return { backgrounded: false, disabled: (r.error ?? '').includes(BACKGROUND_DISABLED), error: true }
  })
  if (read.some((r) => r.backgrounded)) return 'moved'
  if (read.some((r) => r.disabled)) return 'disabled'
  if (read.some((r) => r.error)) return 'failed'
  return 'not_found'
}

/** The extension's `YPn`. */
export function outcomeMessage(outcome: Exclude<BackgroundOutcome, 'moved'>): string {
  switch (outcome) {
    case 'not_found':
      return 'Could not move this to the background. It may have just finished or already be running in the background.'
    case 'disabled':
      return 'Moving to the background is turned off for this session.'
    case 'failed':
      return 'Could not move this to the background. Try again.'
  }
}
