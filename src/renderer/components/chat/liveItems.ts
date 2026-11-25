import type { ContentBlock } from '../../../shared/types'
import { lastAssistantIndex } from '../../../shared/chatHistory'
import type { AssistantMessageItem, ChatItem } from './types'

/** How many blocks of message `id` are already committed. */
export function committedLength(items: ChatItem[], id: string): number {
  const index = lastAssistantIndex(items, id)
  return index === -1 ? 0 : (items[index] as AssistantMessageItem).content.length
}

/** The CLI sends each content block of a message as its own `assistant` event with the same message id; they form one item, as in the extension. */
export function mergeAssistant(items: ChatItem[], incoming: AssistantMessageItem): ChatItem[] {
  const index = lastAssistantIndex(items, incoming.id)
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
  const index = lastAssistantIndex(items, streaming.id)
  if (index === -1) return { items: [...items, streaming], live: { id: streaming.id, from: 0 } }
  const committed = items[index] as AssistantMessageItem
  const from = committed.content.length
  const shown: AssistantMessageItem = { ...committed, content: [...committed.content, ...streaming.content.slice(from)] }
  return { items: [...items.slice(0, index), shown, ...items.slice(index + 1)], live: { id: streaming.id, from } }
}

function showsText(block: ContentBlock): boolean {
  return block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== ''
}

function sameShapeBlock(shape: ContentBlock, block: ContentBlock): boolean {
  if (shape.type !== block.type) return false
  if (block.type === 'text') return showsText(shape) === showsText(block)
  if (block.type === 'thinking') return true
  return shape === block
}

function shapeBlock(block: ContentBlock): ContentBlock {
  if (block.type === 'text') return { type: 'text', text: showsText(block) ? '…' : '' }
  if (block.type === 'thinking') return { ...block, thinking: '' }
  return block
}

/**
 * The streaming message as the row passes (pairing, grouping, row kinds, joins) see it: its blocks with text only as shown or blank.
 * `previous` comes back while a delta changes nothing they read, so a delta does not rerun them.
 */
export function keepShape(previous: AssistantMessageItem | null, streaming: AssistantMessageItem | null): AssistantMessageItem | null {
  if (!streaming) return null
  const same =
    previous !== null &&
    previous.id === streaming.id &&
    previous.content.length === streaming.content.length &&
    streaming.content.every((block, i) => sameShapeBlock(previous.content[i], block))
  return same ? previous : { ...streaming, content: streaming.content.map(shapeBlock) }
}
