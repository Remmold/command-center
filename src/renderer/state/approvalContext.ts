import { PLAN_TOOL, QUESTION_TOOL } from '../../shared/approval'
import type { ChatItem } from '../../shared/chatItems'
import { mcpToolTitle } from '../components/chat/mcpTool'
import { latestTodoCallId, parseTodos } from '../components/chat/todos'
import { pairToolResults } from '../components/chat/toolCall'

/** What the inbox's queue calls a request: the tool, "Server [tool]" for MCP, Question or Plan. */
export function approvalKind(toolName: string): string {
  if (toolName === QUESTION_TOOL) return 'Question'
  if (toolName === PLAN_TOOL) return 'Plan'
  const mcp = mcpToolTitle(toolName, undefined)
  return mcp ? `${mcp.server} [${mcp.tool}]` : toolName
}

/** The newest text Claude wrote in the chat itself (subagents' messages left out); null before any. */
export function lastAssistantText(items: readonly ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant' || item.parentToolUseId) continue
    for (let j = item.content.length - 1; j >= 0; j--) {
      const block = item.content[j]
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) return block.text.trim()
    }
  }
  return null
}

/** The item in progress on the chat's newest todo list; null when none is. */
export function currentTodo(items: ChatItem[]): string | null {
  const id = latestTodoCallId(items, pairToolResults(items))
  if (!id) return null
  for (const item of items) {
    if (item.kind !== 'assistant') continue
    const call = item.content.find((b) => b.type === 'tool_use' && b.id === id)
    if (call?.type === 'tool_use') return parseTodos(call.input)?.find((t) => t.status === 'in_progress')?.content ?? null
  }
  return null
}
