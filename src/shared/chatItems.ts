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
}

export interface ToolResultItem extends Timed {
  kind: 'tool_result'
  id: string
  toolUseId: string
  content: unknown
  isError?: boolean
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

export interface SystemItem extends Timed {
  kind: 'system'
  id: string
  text: string
}

export type ChatItem =
  | UserMessageItem
  | AssistantMessageItem
  | ToolResultItem
  | ResultItem
  | SystemItem
