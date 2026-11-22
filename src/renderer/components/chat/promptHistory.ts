import type { ChatItem } from './types'
import type { HeldPrompt } from './heldPrompts'

/** What `userItemText` appends; never part of a title or a recalled prompt. */
export const ATTACHED_MARKER = /\n\n_\[\d+ (?:images?|files?) attached\]_$/

/** The prompt as the transcript shows it: a note counts the attachments (all images, else files). */
export function userItemText(text: string, attachments: readonly { kind: string }[]): string {
  const count = attachments.length
  if (count === 0) return text
  const noun = attachments.every((a) => a.kind === 'image') ? 'image' : 'file'
  return `${text}\n\n_[${count} ${noun}${count === 1 ? '' : 's'} attached]_`
}

/** This session's prompts, newest first, queued ones included, as in the extension. */
export function historyEntries(items: readonly ChatItem[], held: readonly HeldPrompt[]): string[] {
  const texts = [...items.flatMap((item) => (item.kind === 'user' ? [item.text] : [])), ...held.map((p) => p.text)]
  return texts
    .map((t) => t.replace(ATTACHED_MARKER, '').trim())
    .filter((t) => t.length > 0)
    .reverse()
}

/** `index` -1 is the draft; 0 is the newest prompt. */
export interface HistoryCursor {
  index: number
  draft: string
}

export const NO_RECALL: HistoryCursor = { index: -1, draft: '' }

/** Null when the key should keep its normal caret behaviour. */
export function stepHistory(
  cursor: HistoryCursor,
  entries: readonly string[],
  direction: 'older' | 'newer',
  current: string
): { cursor: HistoryCursor; value: string } | null {
  if (entries.length === 0) return null
  let next: HistoryCursor
  if (direction === 'older') {
    if (cursor.index === -1) next = { index: 0, draft: current }
    else if (cursor.index < entries.length - 1) next = { ...cursor, index: cursor.index + 1 }
    else return null
  } else {
    if (cursor.index === -1) return null
    next = { ...cursor, index: cursor.index - 1 }
  }
  return { cursor: next, value: next.index === -1 ? next.draft : entries[next.index] }
}
