import type { HistoryChange } from '../../shared/chatHistory'
import type { ChatItem } from '../../shared/chatItems'
import { replyLine } from './digest'

/** How long a session's state or reply change waits before the digest is asked to update; later changes ride along. */
export const ACTIVITY_DELAY_MS = 2000

/** The text of the last reply the session's own agent wrote (a subagent's does not count), as one line; null when there is none. */
export function lastReplyOf(items: readonly ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant' || item.parentToolUseId) continue
    const text = item.content
      .flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))
      .join('\n')
      .trim()
    if (text !== '') return replyLine(text)
  }
  return null
}

/** The last reply after `changes`, from the one before them; a change that holds no reply keeps it. */
export function replyAfter(before: string | null, changes: readonly HistoryChange[]): string | null {
  let reply = before
  for (const change of changes) {
    if (change.kind === 'clear' || change.kind === 'delete') reply = null
    else if (change.kind === 'set') reply = lastReplyOf(change.items)
    else reply = lastReplyOf(change.kind === 'append' ? change.items : [change.item]) ?? reply
  }
  return reply
}

/**
 * Each hosted session's last reply, read from the chat history main already saves (ADR 0003): all of it when the
 * window loads it, then each change the window sends. Calls `onChange` with the pane whose reply changed.
 */
export function createLastReplies(onChange: (paneId: string) => void) {
  const replies = new Map<string, string | null>()
  const set = (paneId: string, reply: string | null): void => {
    if ((replies.get(paneId) ?? null) === reply) return
    replies.set(paneId, reply)
    onChange(paneId)
  }
  return {
    loaded: (all: Record<string, ChatItem[]>): void => {
      for (const [paneId, items] of Object.entries(all)) set(paneId, lastReplyOf(items))
    },
    applied: (paneId: string, changes: readonly HistoryChange[]): void => set(paneId, replyAfter(replies.get(paneId) ?? null, changes)),
    get: (paneId: string): string | null => replies.get(paneId) ?? null
  }
}

/**
 * Runs `fn` once, `delayMs` after the first poke of a quiet spell; pokes until then ride along. A steady stream of pokes
 * therefore still runs it every `delayMs`, never starving it as a timer restarted on each poke would.
 */
export function coalesce(fn: () => void, delayMs = ACTIVITY_DELAY_MS) {
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  return {
    poke: (): void => {
      if (stopped) return
      timer ??= setTimeout(() => {
        timer = null
        fn()
      }, delayMs)
    },
    stop: (): void => {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    }
  }
}
