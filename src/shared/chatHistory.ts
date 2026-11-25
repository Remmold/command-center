import type { AssistantMessageItem, ChatItem } from './chatItems'

/** One change to a hosted session's saved chat history, as the chat items store's actions make them. */
export type HistoryChange =
  | { kind: 'append'; items: ChatItem[] }
  /** The assistant item of this id, after a block was joined to it; appended when there is none. */
  | { kind: 'replace'; item: AssistantMessageItem }
  | { kind: 'set'; items: ChatItem[] }
  | { kind: 'clear' }
  | { kind: 'delete' }

export function lastAssistantIndex(items: readonly ChatItem[], id: string): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'assistant' && item.id === id) return i
  }
  return -1
}

/** The items after `change`; a delete leaves none. */
export function applyHistoryChange(items: ChatItem[], change: HistoryChange): ChatItem[] {
  switch (change.kind) {
    case 'append':
      return [...items, ...change.items]
    case 'replace': {
      const index = lastAssistantIndex(items, change.item.id)
      if (index === -1) return [...items, change.item]
      return [...items.slice(0, index), change.item, ...items.slice(index + 1)]
    }
    case 'set':
      return change.items
    case 'clear':
    case 'delete':
      return []
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isItem = (v: unknown): v is ChatItem => isRecord(v) && typeof v.kind === 'string'
export const isChatItemList = (v: unknown): v is ChatItem[] => Array.isArray(v) && v.every(isItem)

/** A change as received over IPC or read from a file: its shape is checked, an item's fields past its kind are not. */
export function isHistoryChange(v: unknown): v is HistoryChange {
  if (!isRecord(v)) return false
  switch (v.kind) {
    case 'append':
    case 'set':
      return isChatItemList(v.items)
    case 'replace':
      return isItem(v.item) && v.item.kind === 'assistant' && typeof v.item.id === 'string'
    case 'clear':
    case 'delete':
      return true
    default:
      return false
  }
}
