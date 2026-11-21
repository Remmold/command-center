import type { ClaudeAssistantEvent, ClaudeResultEvent, ContentBlock } from './types'

export interface UserMessageItem {
  kind: 'user'
  id: string
  text: string
}

export interface AssistantMessageItem {
  kind: 'assistant'
  id: string
  content: ContentBlock[]
  raw: ClaudeAssistantEvent
}

export interface ToolResultItem {
  kind: 'tool_result'
  id: string
  toolUseId: string
  content: unknown
  isError?: boolean
}

export interface ResultItem {
  kind: 'result'
  id: string
  durationMs?: number
  costUsd?: number
  numTurns?: number
  isError: boolean
  raw: ClaudeResultEvent
}

export interface SystemItem {
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
