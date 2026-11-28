import type { ChatItem } from './chatItems'

/** A prompt the app writes and sends on its own, as opposed to one Andreas typed. */
export type AppPromptKind = 'main-chat' | 'feature-start' | 'adopt-start' | 'work-moved' | 'outcome' | 'drift-check' | 'fix-findings' | 'preview-setup'

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

const OUTCOME_PREFIX = '[Command Center] '
const SUMMARY_MAX = 80

/** An outcome line's own first clause, e.g. "Adopted spike/x in app as the feature x". */
function outcomeSummary(text: string): string {
  const body = text.startsWith(OUTCOME_PREFIX) ? text.slice(OUTCOME_PREFIX.length) : text
  const clause = body.split(/;|\.(?=\s|$)/)[0].trim()
  return clause.length > SUMMARY_MAX ? `${clause.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : clause
}

function what(kind: AppPromptKind, text: string): string {
  switch (kind) {
    case 'main-chat':
      return 'main chat instructions'
    case 'feature-start':
      return /\nStarting brief: /.test(text) ? 'started feature with /flow and its brief' : 'started feature with /flow'
    case 'adopt-start':
      return 'adopted work, read its notes first'
    case 'work-moved':
      return 'told the session where its work moved'
    case 'outcome':
      return outcomeSummary(text)
    case 'drift-check':
      return 'drift check instructions'
    case 'fix-findings':
      return 'findings to fix'
    case 'preview-setup':
      return 'preview setup instructions'
  }
}

/** The one line an app prompt shows as, collapsed, e.g. "Command Center · main chat instructions". */
export function appPromptLabel(kind: AppPromptKind, text: string): string {
  return `${APP_PROMPT_MARK} · ${what(kind, text)}`
}

/** The start of each prompt the app writes, in the shapes its builders give it: `mainChatFirstPrompt`, `featureFirstPrompt`, `adoptedFirstPrompt`, `movedWorkPrompt`, the outcome messages, `buildDriftCheck`, `fixMessage` and `buildPreviewSetupPrompt`. */
const KNOWN: readonly [AppPromptKind, RegExp][] = [
  ['main-chat', /^You are the main chat of Command Center\. /],
  ['feature-start', /^\/flow [^\n]*\n(?:[^\n]*\n)*?Feature name: [^\n]+\nFeature worktree: [^\n]+/],
  ['adopt-start', /^Adopted work: branch \S+ in [^\n]+\. Read its \.scratch notes and git log -20 first/],
  ['work-moved', /^This work moved: branch \S+ is now in [^\n]+, and [^\n]+ is back on /],
  ['outcome', /^\[Command Center\] \S/],
  ['drift-check', /^Drift check: check that the context files below still match the code/],
  ['fix-findings', /^Fix findings: apply only the findings below, nothing else\./],
  ['preview-setup', /^Set up preview: propose how this project runs in a browser/]
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
