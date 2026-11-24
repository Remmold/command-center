import { agentFileEnd, HANDBACK_TOOL, isQuiet, type AgentEndHints, type AgentFileEnd } from './agentEnd'
import type { AssistantMessageItem, ChatItem } from './chatItems'

/** Calls whose subagent's messages carry the call's id as `parent_tool_use_id`. */
export const AGENT_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task'])

/**
 * What the Agents tab, the inline Agent rows and the still-working bar need of one agent's file, without its items:
 * built once from the file and grown line by line while the agent works.
 */
export interface AgentSummary {
  /** Its chat items, all kinds. */
  items: number
  /** Its assistant messages, to tell whether the parent's stream has carried more of it than the file. */
  replies: number
  toolUses: number
  firstAt?: number
  lastAt?: number
  /** Its last reply and what came after it, enough for how it ended and its now line; tool output is left out. */
  last: ChatItem[]
  /** It handed back before; a prompt after that means SendMessage woke it. */
  handedBack: boolean
  woken: boolean
  /** The Agent calls it made and their results, for the agents it started. */
  calls: ChatItem[]
}

export const EMPTY_SUMMARY: AgentSummary = { items: 0, replies: 0, toolUses: 0, last: [], handedBack: false, woken: false, calls: [] }

const slim = (item: AssistantMessageItem): AssistantMessageItem => ({ ...item, raw: { ...item.raw, message: { ...item.raw.message, content: [] } } })

/** The ids of the Agent calls in one reply. */
export function agentCallIds(item: AssistantMessageItem): string[] {
  return item.content.flatMap((b) => (b.type === 'tool_use' && typeof b.id === 'string' && AGENT_TOOLS.has(b.name as string) ? [b.id] : []))
}

const handsBack = (item: AssistantMessageItem): boolean => item.content.some((b) => b.type === 'tool_use' && b.name === HANDBACK_TOOL)

/** The summary with `items`, the file's next lines, added. */
export function addToSummary(summary: AgentSummary, items: readonly ChatItem[]): AgentSummary {
  if (items.length === 0) return summary
  let { replies, toolUses, firstAt, lastAt, handedBack, woken } = summary
  let last = summary.last
  let calls = summary.calls
  const callIds = new Set(calls.flatMap((i) => (i.kind === 'assistant' ? agentCallIds(i) : [])))
  for (const item of items) {
    if (item.at !== undefined) {
      firstAt ??= item.at
      lastAt = item.at
    }
    if (item.kind === 'assistant') {
      replies++
      for (const b of item.content) if (b.type === 'tool_use') toolUses++
      last = [slim(item)]
      const ids = agentCallIds(item)
      if (ids.length > 0) {
        calls = [...calls, slim(item)]
        for (const id of ids) callIds.add(id)
      }
      if (handsBack(item)) handedBack = true
      continue
    }
    if (item.kind === 'user' && handedBack) woken = true
    if (item.kind === 'tool_result' && callIds.has(item.toolUseId)) calls = [...calls, item]
    if (last.length > 0) last = [...last, item.kind === 'tool_result' ? { ...item, content: '' } : item]
  }
  return { items: summary.items + items.length, replies, toolUses, ...(firstAt !== undefined ? { firstAt } : {}), ...(lastAt !== undefined ? { lastAt } : {}), last, handedBack, woken, calls }
}

export function summarizeAgent(items: readonly ChatItem[]): AgentSummary {
  return addToSummary(EMPTY_SUMMARY, items)
}

/** How the agent's file says it ended, by `agentFileEnd`'s rules, from its summary. */
export function summaryEnd(summary: AgentSummary, hints: AgentEndHints): AgentFileEnd | undefined {
  return agentFileEnd(summary.last, { ...hints, woken: summary.woken })
}

/**
 * Whether its file needs no more following: it handed back, was interrupted, the CLI marked it finished, or nothing
 * has been written for 10 minutes. A settled file that grows again is followed again.
 */
export function agentSettled(summary: AgentSummary, hints: Pick<AgentEndHints, 'finished'>, now: number): boolean {
  const quiet = isQuiet(summary.lastAt, now)
  return quiet || summaryEnd(summary, { ...hints, quiet }) !== undefined
}

/**
 * Whether an agent its live process still reports as working has stopped counting: only its file showing the end does,
 * never silence, as a long build writes nothing to it until it returns.
 */
export function agentOver(summary: AgentSummary, hints: Pick<AgentEndHints, 'finished'>): boolean {
  return summaryEnd(summary, hints) !== undefined
}
