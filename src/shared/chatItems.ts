import type { ClaudeAssistantEvent, ClaudeResultEvent, ContentBlock } from './types'

interface Timed {
  /** When it was sent or received, in epoch ms: the receive time live, a transcript line's `timestamp` when observed. */
  at?: number
}

export interface UserMessageItem extends Timed {
  kind: 'user'
  id: string
  text: string
}

export interface AssistantMessageItem extends Timed {
  kind: 'assistant'
  id: string
  content: ContentBlock[]
  raw: ClaudeAssistantEvent
  /** How long each thinking block took, by its index in `content`; only known for blocks streamed live. */
  thinkingMs?: Record<number, number>
  /** The Agent (or SendMessage) call this message belongs to, when a subagent sent it. */
  parentToolUseId?: string
}

export interface ToolResultItem extends Timed {
  kind: 'tool_result'
  id: string
  toolUseId: string
  content: unknown
  isError?: boolean
  /** The Agent (or SendMessage) call whose subagent ran this tool. */
  parentToolUseId?: string
}

export interface ResultItem extends Timed {
  kind: 'result'
  id: string
  durationMs?: number
  costUsd?: number
  numTurns?: number
  isError: boolean
  raw: ClaudeResultEvent
}

/** What a `compact_boundary` reports: what started the compaction and the context size before it. */
export interface CompactMetadata {
  trigger: string
  preTokens: number
}

export interface SystemItem extends Timed {
  kind: 'system'
  id: string
  text: string
  /** Set on a compaction boundary. */
  compact?: CompactMetadata
  /** The summary the CLI wrote after a compaction, drawn inside the boundary's line. */
  compactSummary?: string
}

export type ChatItem =
  | UserMessageItem
  | AssistantMessageItem
  | ToolResultItem
  | ResultItem
  | SystemItem
