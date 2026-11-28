import { create } from 'zustand'
import { lastAssistantIndex, type HistoryChange } from '../../shared/chatHistory'
import type { RendererApi } from '../../shared/types'
import { markAppPrompts } from '../../shared/appPrompts'
import type { AssistantMessageItem, ChatItem } from '../components/chat/types'
import { mergeAssistant } from '../components/chat/liveItems'

interface ChatItemsState {
  items: Record<string, ChatItem[]>
  appendItems: (paneId: string, newItems: ChatItem[]) => void
  /** Adds an assistant event, joining it to the item of the same message when there is one. */
  mergeAssistant: (paneId: string, item: AssistantMessageItem) => void
  setItems: (paneId: string, items: ChatItem[]) => void
  clearItems: (paneId: string) => void
  deletePane: (paneId: string) => void
}

/** Where each action's change to the saved history goes. */
export interface HistoryBridge {
  send: (paneId: string, change: HistoryChange) => void
}

let bridge: HistoryBridge | null = null

export function connectHistoryBridge(next: HistoryBridge | null): void {
  bridge = next
}

const emit = (paneId: string, change: HistoryChange): void => bridge?.send(paneId, change)

export const useChatItemsStore = create<ChatItemsState>()((set, get) => ({
  items: {},
  appendItems: (paneId, newItems) => {
    set((s) => ({ items: { ...s.items, [paneId]: [...(s.items[paneId] ?? []), ...newItems] } }))
    emit(paneId, { kind: 'append', items: newItems })
  },
  mergeAssistant: (paneId, item) => {
    const before = get().items[paneId] ?? []
    const after = mergeAssistant(before, item)
    set((s) => ({ items: { ...s.items, [paneId]: after } }))
    const index = lastAssistantIndex(before, item.id)
    emit(paneId, index === -1 ? { kind: 'append', items: [item] } : { kind: 'replace', item: after[index] as AssistantMessageItem })
  },
  setItems: (paneId, items) => {
    set((s) => ({ items: { ...s.items, [paneId]: items } }))
    emit(paneId, { kind: 'set', items })
  },
  clearItems: (paneId) => {
    set((s) => ({ items: { ...s.items, [paneId]: [] } }))
    emit(paneId, { kind: 'clear' })
  },
  deletePane: (paneId) => {
    set((s) => {
      const next = { ...s.items }
      delete next[paneId]
      return { items: next }
    })
    emit(paneId, { kind: 'delete' })
  }
}))

/** Shows saved history, with app prompts saved before their origin was kept marked; a chat already changed in this window keeps its items. Nothing is sent back. */
export function hydrateChatItems(saved: Record<string, ChatItem[]>): void {
  const marked = Object.fromEntries(Object.entries(saved).map(([paneId, items]) => [paneId, markAppPrompts(items)]))
  useChatItemsStore.setState((s) => ({ items: { ...marked, ...s.items } }))
}

/** Sends each session's changes made in one task as one message, in order. */
function windowBridge(api: RendererApi['chatHistory']): HistoryBridge {
  const pending = new Map<string, HistoryChange[]>()
  const flush = (): void => {
    for (const [paneId, changes] of pending) api.apply(paneId, changes)
    pending.clear()
  }
  return {
    send: (paneId, change) => {
      if (pending.size === 0) queueMicrotask(flush)
      const changes = pending.get(paneId)
      if (changes) changes.push(change)
      else pending.set(paneId, [change])
    }
  }
}

/** The legacy zustand-persist history entry; removed once imported. */
const LEGACY_KEY = 'command-center.chat-items'

/**
 * Moves the legacy localStorage history into main's files, once: the entry is removed after the import resolves, also
 * when main finds it is not chat history (it never will be), and a failed import keeps it for the next start. Never
 * rejects. The entry is handed over as read, unparsed.
 */
export async function migrateLegacyChatItems(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  importLegacy: RendererApi['chatHistory']['importLegacy']
): Promise<void> {
  try {
    const entry = storage.getItem(LEGACY_KEY)
    if (entry === null) return
    await importLegacy(entry)
    storage.removeItem(LEGACY_KEY)
  } catch (err) {
    console.error('could not move the saved chat history over; it stays for the next start', err)
  }
}

/** Connects the store to main's history files and shows what they hold. */
export function loadChatHistory(api: RendererApi['chatHistory']): void {
  connectHistoryBridge(windowBridge(api))
  try {
    hydrateChatItems(api.loadSync())
  } catch (err) {
    console.error('could not read the chat history', err)
  }
}
