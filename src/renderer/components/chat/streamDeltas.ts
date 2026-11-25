import type { AssistantMessageItem } from './types'

export interface StreamDelta {
  index: number
  delta: { type?: string; text?: string; thinking?: string; partial_json?: string }
}

/** The streaming message with `deltas` appended to their blocks in order; the same message when none applied. */
export function applyDeltas(message: AssistantMessageItem, deltas: readonly StreamDelta[]): AssistantMessageItem {
  let content: AssistantMessageItem['content'] | null = null
  for (const { index, delta } of deltas) {
    const current = content ?? message.content
    const block = current[index]
    if (!block) continue
    let next: (typeof current)[number] | null = null
    if (delta.type === 'text_delta' && block.type === 'text' && typeof delta.text === 'string') {
      next = { type: 'text', text: (block as { text: string }).text + delta.text }
    } else if (delta.type === 'thinking_delta' && block.type === 'thinking' && typeof delta.thinking === 'string') {
      next = { ...block, thinking: (typeof block.thinking === 'string' ? block.thinking : '') + delta.thinking }
    }
    if (!next) continue
    content ??= [...message.content]
    content[index] = next
  }
  return content ? { ...message, content } : message
}

export interface FrameBatch<T> {
  push(entry: T): void
  /** Applies what is waiting now, so an event that must land after it can. */
  flush(): void
  cancel(): void
}

/** Runs `cb` in a task of its own just after the next frame, so a key typed meanwhile paints without waiting on it. */
function afterNextFrame(cb: () => void): void {
  requestAnimationFrame(() => setTimeout(cb, 0))
}

/** Gathers entries and applies them together at most once per animation frame. */
export function frameBatch<T>(apply: (entries: T[]) => void, schedule: (cb: () => void) => void = afterNextFrame): FrameBatch<T> {
  let waiting: T[] = []
  /** The scheduled run that is still due; a flush or cancel makes an earlier one a no-op. */
  let due: object | null = null
  const flush = (): void => {
    due = null
    if (waiting.length === 0) return
    const entries = waiting
    waiting = []
    apply(entries)
  }
  return {
    push(entry) {
      waiting.push(entry)
      if (due) return
      const run = {}
      due = run
      schedule(() => {
        if (due === run) flush()
      })
    },
    flush,
    cancel() {
      due = null
      waiting = []
    }
  }
}
