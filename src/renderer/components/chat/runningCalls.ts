import type { ChatItem, ToolResultItem } from './types'
import type { ToolCallStatus } from './ToolCallRow'

const NONE: ReadonlySet<string> = new Set()

/** The tool calls of the current turn (since the last prompt) with no result yet, while the turn runs. */
export function runningCalls(items: readonly ChatItem[], busy: boolean): ReadonlySet<string> {
  if (!busy) return NONE
  let start = 0
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'user') {
      start = i + 1
      break
    }
  }
  const open = new Set<string>()
  for (let i = start; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'tool_result') open.delete(item.toolUseId)
    if (item.kind !== 'assistant') continue
    for (const block of item.content) {
      if (block.type === 'tool_use' && typeof block.id === 'string') open.add(block.id)
    }
  }
  return open.size === 0 ? NONE : open
}

/** As the extension's `DPt`: a result decides; without one a running call blinks and any other shows an open ring. */
export function toolCallStatus(result: ToolResultItem | undefined, running: boolean): ToolCallStatus {
  if (result) return result.isError ? 'error' : 'ok'
  return running ? 'running' : 'pending'
}
