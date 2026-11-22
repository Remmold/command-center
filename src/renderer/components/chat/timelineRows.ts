import type { ContentBlock } from '../../../shared/types'
import type { ChatItem } from './types'
import type { ToolPairs } from './toolCall'
import type { CompactPairs } from './compaction'
import type { TimelinePlace } from '../ui/Timeline'

/** How a chat item draws: as timeline steps, as a block that breaks the line (a prompt, a note), or not at all. */
export type RowKind = 'timeline' | 'plain' | 'hidden'

/** Tools the extension leaves out of the chat (`hidden` on its renderer). */
const HIDDEN_TOOLS: ReadonlySet<string> = new Set(['ToolSearch'])

/** Indexes of the blocks of a reply that draw a step of their own. */
export function visibleBlocks(content: ContentBlock[]): number[] {
  const shown: number[] = []
  content.forEach((block, i) => {
    if (block.type === 'thinking') shown.push(i)
    else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') shown.push(i)
    else if (block.type === 'tool_use' && typeof block.name === 'string' && !HIDDEN_TOOLS.has(block.name)) shown.push(i)
  })
  return shown
}

export function rowKind(item: ChatItem, pairs: ToolPairs, compactions: CompactPairs): RowKind {
  switch (item.kind) {
    case 'assistant':
      return visibleBlocks(item.content).length > 0 ? 'timeline' : 'hidden'
    case 'tool_result':
      return pairs.isPaired(item) ? 'hidden' : 'timeline'
    case 'system':
      if (compactions.drawnInBoundary.has(item.id)) return 'hidden'
      return item.compact || item.compactSummary !== undefined ? 'timeline' : 'plain'
    default:
      return 'plain'
  }
}

/** For each row, whether the timeline line runs on into the next drawn row above and below it. */
export function timelineJoins(kinds: RowKind[]): TimelinePlace[] {
  const drawn = kinds.map((k, i) => ({ k, i })).filter(({ k }) => k !== 'hidden')
  const joins: TimelinePlace[] = kinds.map(() => ({ above: false, below: false }))
  drawn.forEach(({ k, i }, n) => {
    if (k !== 'timeline') return
    joins[i] = { above: drawn[n - 1]?.k === 'timeline', below: drawn[n + 1]?.k === 'timeline' }
  })
  return joins
}
