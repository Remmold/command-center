import type { ContentBlock } from '../../../shared/types'
import type { AssistantMessageItem, ChatItem } from './types'

function indexOfAssistant(items: ChatItem[], id: string): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'assistant' && item.id === id) return i
  }
  return -1
}

/** How many blocks of message `id` are already committed. */
export function committedLength(items: ChatItem[], id: string): number {
  const index = indexOfAssistant(items, id)
  return index === -1 ? 0 : (items[index] as AssistantMessageItem).content.length
}

/** The CLI sends each content block of a message as its own `assistant` event with the same message id; they form one item, as in the extension. */
export function mergeAssistant(items: ChatItem[], incoming: AssistantMessageItem): ChatItem[] {
  const index = indexOfAssistant(items, incoming.id)
  if (index === -1) return [...items, incoming]
  const committed = items[index] as AssistantMessageItem
  const thinkingMs = committed.thinkingMs || incoming.thinkingMs ? { ...committed.thinkingMs, ...incoming.thinkingMs } : undefined
  const merged: AssistantMessageItem = {
    ...committed,
    content: [...committed.content, ...incoming.content],
    // A reply is stamped when its last block arrived.
    ...(incoming.at !== undefined ? { at: incoming.at } : {}),
    ...(thinkingMs ? { thinkingMs } : {})
  }
  return [...items.slice(0, index), merged, ...items.slice(index + 1)]
}

/** Durations of the thinking blocks in `blocks`, which start at `firstIndex` of their message; a block lasts from its first stream event to its commit. */
export function thinkingDurations(
  startedAt: ReadonlyMap<number, number>,
  firstIndex: number,
  blocks: ContentBlock[],
  now: number
): Record<number, number> | undefined {
  let out: Record<number, number> | undefined
  blocks.forEach((block, i) => {
    const index = firstIndex + i
    const start = startedAt.get(index)
    if (block.type !== 'thinking' || start === undefined) return
    out = { ...out, [index]: now - start }
  })
  return out
}

export interface LiveView {
  items: ChatItem[]
  /** The streaming message and the index of its first block not committed yet. */
  live: { id: string; from: number } | null
}

/** The committed items with the message still streaming drawn in place of, or after, its committed part. */
export function withStreaming(items: ChatItem[], streaming: AssistantMessageItem | null): LiveView {
  if (!streaming) return { items, live: null }
  const index = indexOfAssistant(items, streaming.id)
  if (index === -1) return { items: [...items, streaming], live: { id: streaming.id, from: 0 } }
  const committed = items[index] as AssistantMessageItem
  const from = committed.content.length
  const shown: AssistantMessageItem = { ...committed, content: [...committed.content, ...streaming.content.slice(from)] }
  return { items: [...items.slice(0, index), shown, ...items.slice(index + 1)], live: { id: streaming.id, from } }
}
