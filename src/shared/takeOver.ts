export type ObservedTurn = 'idle' | 'working' | 'waiting-input'

/** The `status` a running CLI keeps in `<config>/sessions/<pid>.json`, as the extension reads it. */
export type CliProcessStatus = 'busy' | 'shell' | 'idle' | 'waiting'

export interface ObservedTurnInput {
  /** The transcript's latest complete lines, oldest first. */
  lines: readonly string[]
  /** The observed status is Live. */
  live: boolean
  /** Absent when no running CLI has the session. */
  process?: CliProcessStatus
}

interface Block {
  type?: string
  id?: string
  name?: string
  tool_use_id?: string
  text?: unknown
}

interface Line {
  type?: string
  isSidechain?: boolean
  isMeta?: boolean
  message?: { stop_reason?: string | null; content?: unknown }
}

const INTERRUPTED = '[Request interrupted by user'
const ENDED: ReadonlySet<string> = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal'])
/** Tools whose call waits for the user's answer rather than for the tool to run. */
const ASKS_USER: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode'])

type Last = 'prompt' | 'ended' | 'tool' | 'streaming'

function parse(raw: string): Line | null {
  try {
    const line = JSON.parse(raw) as Line
    if (line.isSidechain || line.isMeta || !line.message) return null
    return line.type === 'user' || line.type === 'assistant' ? line : null
  } catch {
    return null
  }
}

function blocks(line: Line): Block[] {
  return Array.isArray(line.message?.content) ? (line.message.content as Block[]) : []
}

function interrupted(line: Line): boolean {
  const content = line.message?.content
  if (typeof content === 'string') return content.startsWith(INTERRUPTED)
  return blocks(line).some((b) => b.type === 'text' && typeof b.text === 'string' && b.text.startsWith(INTERRUPTED))
}

export function observedTurn({ lines, live, process }: ObservedTurnInput): ObservedTurn {
  let last: Last | null = null
  const pending = new Map<string, string>()
  for (const raw of lines) {
    const line = parse(raw)
    if (!line) continue
    if (line.type === 'assistant') {
      const stop = line.message?.stop_reason
      const calls = blocks(line).filter((b) => b.type === 'tool_use')
      for (const call of calls) if (call.id) pending.set(call.id, call.name ?? '')
      last = stop && ENDED.has(stop) ? 'ended' : calls.length > 0 || stop === 'tool_use' ? 'tool' : 'streaming'
    } else {
      for (const b of blocks(line)) if (b.type === 'tool_result' && b.tool_use_id) pending.delete(b.tool_use_id)
      last = interrupted(line) ? 'ended' : 'prompt'
    }
  }
  if (last === 'ended' || last === null) return 'idle'
  if (process === 'waiting') return 'waiting-input'
  if (!live && process !== 'busy' && process !== 'shell') return 'idle'
  if (last === 'tool' && [...pending.values()].some((name) => ASKS_USER.has(name))) return 'waiting-input'
  return 'working'
}

export type TakeOverStep = 'switch' | 'wait' | 'stop'

/** A take-over hands the chat over once VS Code's agent is not mid-turn; `now` hands it over regardless. */
export function takeOverStep({ turn, cancelled, now = false }: { turn: ObservedTurn; cancelled: boolean; now?: boolean }): TakeOverStep {
  if (cancelled) return 'stop'
  return now || turn !== 'working' ? 'switch' : 'wait'
}
