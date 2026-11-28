import type { ChatItem } from '../../shared/chatItems'
import type { HeldPrompt } from '../components/chat/heldPrompts'
import { ATTACHED_MARKER } from '../components/chat/promptHistory'

export interface LastPrompt {
  id: string
  text: string
}

/** The newest prompt Claude has been sent in this chat; a prompt still queued or held, or one the app wrote, does not count. */
export function lastPrompt(items: readonly ChatItem[], held: readonly HeldPrompt[] = []): LastPrompt | null {
  const waiting = new Set(held.map((p) => p.uuid))
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'user' || item.appPrompt || waiting.has(item.id)) continue
    return { id: item.id, text: item.text.replace(ATTACHED_MARKER, '').trim() }
  }
  return null
}
