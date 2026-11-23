import type { PromptAttachment } from '../components/chat/attachments'
import type { ChatItem } from '../components/chat/types'
import { makeThumb, withThumbnails } from '../components/chat/userAttachments'
import { useChatItemsStore } from './chatItemsStore'
import { useHeldPromptsStore } from './heldPromptsStore'

/** Adds the thumbnails to a prompt already shown, held or in the chat, so making them never delays or reorders a send. */
export function fillThumbnails(paneId: string, uuid: string, attachments: readonly PromptAttachment[]): void {
  void withThumbnails(attachments, makeThumb).then((done) => {
    if (!done.some((a) => a.thumb)) return
    const held = useHeldPromptsStore.getState()
    const prompts = held.byPane[paneId] ?? []
    if (prompts.some((p) => p.uuid === uuid)) held.set(paneId, prompts.map((p) => (p.uuid === uuid ? { ...p, attachments: done } : p)))
    const chat = useChatItemsStore.getState()
    const items = chat.items[paneId] ?? []
    if (items.some((i) => i.id === uuid && i.kind === 'user')) {
      chat.setItems(paneId, items.map((i): ChatItem => (i.id === uuid && i.kind === 'user' ? { ...i, attachments: done } : i)))
    }
  })
}
