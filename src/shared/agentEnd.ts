import type { AssistantMessageItem, ChatItem } from './chatItems'

/** Without a live process to report it, an agent whose file, and whose own agents' files, have not grown for this long ended. */
export const AGENT_QUIET_MS = 10 * 60_000

/** The tool an agent calls to deliver its report; its call is the agent's last act. */
export const HANDBACK_TOOL = 'SubagentHandback'

const INTERRUPTED = '[Request interrupted by user'
const RELAY_NOTICE = /^This agent's report was delivered to you as a message from "[^"]*" \(its SubagentHandback call\)\. Read it there; it is not repeated here\.\s*$/

/** Whether nothing has happened since `lastActivityAt` for longer than `AGENT_QUIET_MS`. */
export function isQuiet(lastActivityAt: number | undefined, now: number): boolean {
  return lastActivityAt !== undefined && now - lastActivityAt > AGENT_QUIET_MS
}

/** The later of two times, either of which may be unknown. */
export function latestOf(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined ? b : b === undefined ? a : Math.max(a, b)
}

export interface AgentFileEnd {
  status: 'finished' | 'stopped'
  at?: number
  report?: string
  /** The report came through the handback call, so its transcript shows it only as a folded tool row. */
  handedBack?: boolean
}

export interface AgentEndHints {
  /** The CLI marked the agent finished in its meta file; a prompt after its handback (a wake) overrides it. */
  finished?: boolean
  /** The session saw it end: the Agent call's result or its task notification. */
  confirmed?: boolean
  /** Its file has not grown for `AGENT_QUIET_MS`. */
  quiet?: boolean
  /** Known apart from the items given: a prompt came after an earlier handback. */
  woken?: boolean
}

/** The CLI's stand-in for a report it already delivered elsewhere; it says nothing about what the agent did. */
export function isRelayNotice(text: string): boolean {
  return RELAY_NOTICE.test(text.trim())
}

function lastAssistantIndex(items: readonly ChatItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'assistant') return i
  return -1
}

function handbackMessage(item: AssistantMessageItem): string | undefined {
  for (const b of item.content) {
    if (b.type !== 'tool_use' || b.name !== HANDBACK_TOOL) continue
    const message = (b.input as { message?: unknown } | undefined)?.message
    return typeof message === 'string' ? message : ''
  }
  return undefined
}

function plainText(item: AssistantMessageItem): string | undefined {
  if (item.content.some((b) => b.type === 'tool_use')) return undefined
  const text = item.content
    .flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))
    .join('\n')
    .trim()
  return text === '' ? undefined : text
}

const lastAt = (items: readonly ChatItem[]): number | undefined => {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].at !== undefined) return items[i].at
  return undefined
}

const shown = (report: string | undefined): string | undefined => (report && !isRelayNotice(report) ? report : undefined)

/** What it reported: the message it handed back, else its last plain text; never the CLI's relay notice. */
export function agentReport(items: readonly ChatItem[]): string | undefined {
  const i = lastAssistantIndex(items)
  if (i < 0) return undefined
  const last = items[i] as AssistantMessageItem
  return shown(handbackMessage(last)?.trim() || plainText(last))
}

/**
 * How an agent's own file says it ended, or undefined while it may still be working. A handback or an interrupt ends
 * it; a last reply of plain text ends it once the session confirms it or the file went quiet; a new prompt after
 * either wakes it again.
 */
export function agentFileEnd(items: readonly ChatItem[], hints: AgentEndHints): AgentFileEnd | undefined {
  const i = lastAssistantIndex(items)
  const after = items.slice(i + 1)
  const interrupt = after.find((it) => it.kind === 'user' && it.text.startsWith(INTERRUPTED))
  if (interrupt) return { status: 'stopped', ...(interrupt.at !== undefined ? { at: interrupt.at } : {}) }
  if (after.some((it) => it.kind === 'user')) return undefined
  const last = i >= 0 ? (items[i] as AssistantMessageItem) : undefined
  const at = lastAt(items)
  const ended = (report: string | undefined): AgentFileEnd => ({ status: 'finished', ...(at !== undefined ? { at } : {}), ...(shown(report) ? { report } : {}) })
  const handback = last && handbackMessage(last)
  if (handback !== undefined) return { ...ended(handback.trim() || undefined), handedBack: true }
  const text = last && plainText(last)
  if (text !== undefined && (hints.confirmed || hints.quiet || hints.finished)) return ended(text)
  if (hints.finished && !hints.woken && !wokenAfterHandback(items)) return ended(undefined)
  return undefined
}

/** A prompt after a handback: SendMessage woke the agent, and the CLI's finished mark is from before. */
function wokenAfterHandback(items: readonly ChatItem[]): boolean {
  let handedBack = false
  for (const item of items) {
    if (item.kind === 'assistant' && handbackMessage(item) !== undefined) handedBack = true
    else if (handedBack && item.kind === 'user') return true
  }
  return false
}

