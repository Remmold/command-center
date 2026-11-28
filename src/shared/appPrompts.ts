import type { ChatItem } from './chatItems'

/** A prompt the app writes and sends on its own, as opposed to one Andreas typed. */
export type AppPromptKind = 'drift-check' | 'fix-findings'

/** Where an app prompt came from: its kind, and the title the app knows its session by, used if the prompt is the session's first. */
export interface AppOrigin {
  kind: AppPromptKind
  title: string
}

export interface AppPrompt extends AppOrigin {
  text: string
}

export const appPrompt = (kind: AppPromptKind, text: string, title: string): AppPrompt => ({ kind, text, title })

/** A prompt as the send paths carry it: typed text, or a prompt the app wrote. */
export type OutgoingPrompt = string | AppPrompt

export function outgoing(prompt: OutgoingPrompt): { text: string; origin?: AppOrigin } {
  return typeof prompt === 'string' ? { text: prompt } : { text: prompt.text, origin: { kind: prompt.kind, title: prompt.title } }
}

export const APP_PROMPT_MARK = 'Command Center'

const LABELS: Record<AppPromptKind, string> = {
  'drift-check': 'drift check instructions',
  'fix-findings': 'findings to fix'
}

/** The one line an app prompt shows as, collapsed, e.g. "Command Center · drift check instructions". A kind of a retired feature, kept in old history, shows as a plain app prompt. */
export function appPromptLabel(kind: AppPromptKind): string {
  return `${APP_PROMPT_MARK} · ${LABELS[kind] ?? 'app prompt'}`
}

/** The start of each prompt the app writes, in the shapes `buildDriftCheck` and `fixMessage` give it. */
const KNOWN: readonly [AppPromptKind, RegExp][] = [
  ['drift-check', /^Drift check: check that the context files below still match the code/],
  ['fix-findings', /^Fix findings: apply only the findings below, nothing else\./]
]

/**
 * Which app prompt a text is, for a prompt that reached the chat without its origin: the CLI's transcript replayed on
 * resume, or history saved before the origin was kept. Matches only the app's own prompt shapes.
 */
export function knownAppPrompt(text: string): AppPromptKind | null {
  for (const [kind, shape] of KNOWN) if (shape.test(text)) return kind
  return null
}

/** The items with each unmarked user prompt that is a known app prompt marked as one; the same array when none is. */
export function markAppPrompts(items: ChatItem[]): ChatItem[] {
  let out: ChatItem[] | null = null
  items.forEach((item, i) => {
    if (item.kind !== 'user' || item.appPrompt !== undefined) return
    const kind = knownAppPrompt(item.text)
    if (kind === null) return
    out ??= [...items]
    out[i] = { ...item, appPrompt: kind }
  })
  return out ?? items
}
