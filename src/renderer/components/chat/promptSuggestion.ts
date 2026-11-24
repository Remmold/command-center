export type SuggestionClear = 'turn-started' | 'sent' | 'interrupted' | 'restarted' | 'dismissed'

export type SuggestionAction = { type: 'line'; line: unknown } | { type: 'clear'; reason: SuggestionClear }

/** The CLI's `{"type":"prompt_suggestion","suggestion":"…"}` line; the latest one wins. */
export function suggestionReducer(current: string | null, action: SuggestionAction): string | null {
  if (action.type === 'clear') return null
  const line = action.line
  if (typeof line !== 'object' || line === null) return current
  const { type, suggestion } = line as { type?: unknown; suggestion?: unknown }
  if (type !== 'prompt_suggestion' || typeof suggestion !== 'string' || suggestion === '') return current
  return suggestion
}

/** Shown as the prompt box's placeholder, as in the extension: only while the box is empty and no turn runs. */
export function shownSuggestion(suggestion: string | null, box: { value: string; busy: boolean }): string | null {
  return suggestion !== null && box.value === '' && !box.busy ? suggestion : null
}

interface KeyLike {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

/** Tab fills the box with the shown suggestion (it does not send); Esc dismisses it. */
export function suggestionKey(e: KeyLike, shown: boolean): 'accept' | 'dismiss' | null {
  if (!shown || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null
  if (e.key === 'Tab') return 'accept'
  if (e.key === 'Escape') return 'dismiss'
  return null
}

/**
 * The extension's `syncPromptSuggestionPauses`: a chat off screen asks its CLI to stop suggesting, since each
 * suggestion costs usage. Returns the `paused` value to send, or null when the CLI already has it.
 */
export function pauseToSend(sent: boolean, onScreen: boolean): boolean | null {
  const paused = !onScreen
  return paused === sent ? null : paused
}
