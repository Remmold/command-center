import type { AgentSummary } from './agentSummary'
import type { ChatItem } from './chatItems'

/** What a subagent's `agent-<id>.meta.json` says about it; only the id is certain. */
export interface SubagentMeta {
  agentId: string
  agentType?: string
  description?: string
  /** The Agent call that started it. */
  toolUseId?: string
  /** The CLI marked it finished. */
  finished?: boolean
  /** The session's prompt whose turn started it, from its file's first line. */
  promptId?: string
  /** Its file's first line's time, read apart from the tail so a long file still knows when it began. */
  startedAt?: number
}

/** What the session's `subagents/` folder holds for one agent: its meta and its file's summary, never its items. */
export interface AgentTail {
  meta: SubagentMeta
  summary: AgentSummary
}

/** A session's followed agent files, by agent id. */
export type AgentTails = Readonly<Record<string, AgentTail>>

/** A session whose `subagents/` folder is followed, named by its cwd and session id. */
export interface SubagentSource {
  cwd: string
  sessionId: string
}

export function subagentSourceKey(source: SubagentSource): string {
  return `${source.cwd}\n${source.sessionId}`
}

/** One agent's meta and file summary, sent on first sight and whenever either changes. */
export interface SubagentSummaryEvent {
  kind: 'summary'
  key: string
  agentId: string
  meta: SubagentMeta
  summary: AgentSummary
}

/** New items from an agent's file while its live view is open; `reset` replaces what was read before (the first read, or a file that shrank). */
export interface SubagentItemsEvent {
  kind: 'items'
  key: string
  agentId: string
  items: ChatItem[]
  reset?: boolean
}

export type SubagentTailEvent = SubagentSummaryEvent | SubagentItemsEvent

/** One agent of a followed session, whose items its open live view wants. */
export interface SubagentItemsSource extends SubagentSource {
  agentId: string
}
