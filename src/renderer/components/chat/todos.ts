import type { ToolPairs } from './toolCall'
import type { ChatItem } from './types'

export const TODO_TOOL = 'TodoWrite'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface Todo {
  content: string
  status: TodoStatus
}

const STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'completed'])

export function parseTodos(input: unknown): Todo[] | undefined {
  if (!input || typeof input !== 'object') return undefined
  const todos = (input as { todos?: unknown }).todos
  if (!Array.isArray(todos)) return undefined
  return todos.flatMap((t): Todo[] => {
    if (!t || typeof t !== 'object') return []
    const { content, status } = t as { content?: unknown; status?: unknown }
    if (typeof content !== 'string') return []
    return [{ content, status: typeof status === 'string' && STATUSES.has(status) ? (status as TodoStatus) : 'pending' }]
  })
}

/** The newest TodoWrite call that did not fail: each call carries the whole list, so it replaces the ones before (the extension's `G$e`). */
export function latestTodoCallId(items: ChatItem[], pairs: ToolPairs): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant') continue
    for (let j = item.content.length - 1; j >= 0; j--) {
      const block = item.content[j]
      if (block.type !== 'tool_use' || block.name !== TODO_TOOL || typeof block.id !== 'string') continue
      if (pairs.resultFor.get(block.id)?.isError === true || parseTodos(block.input) === undefined) continue
      return block.id
    }
  }
  return undefined
}
