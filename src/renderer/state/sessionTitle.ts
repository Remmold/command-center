export const NEW_SESSION_TITLE = 'New session'

export interface SessionTitle {
  title: string
  /** Set once the user names the session; prompts never change the title after that. */
  titleRenamed?: boolean
  /** Set once Claude named the session (`generate_session_title`); prompts and later replies never change it. */
  titleFromClaude?: boolean
}

function firstLine(text: string): string {
  return (text.split('\n').find((line) => line.trim() !== '') ?? '').replace(/\s+/g, ' ').trim()
}

const MAX_TITLE = 60

function shortened(line: string): string {
  return line.length <= MAX_TITLE ? line : line.slice(0, MAX_TITLE - 1).trimEnd() + '…'
}

/**
 * Only the first prompt with text names a session, and never once it was renamed. A prompt the app wrote never names it
 * by its text: the session takes `appTitle`, the name the app knows it by (the main chat, a feature's name, a drift check).
 */
export function titleAfterPrompt(session: SessionTitle, prompt: string, appTitle?: string): SessionTitle {
  if (session.titleRenamed || session.title !== NEW_SESSION_TITLE) return session
  const line = appTitle !== undefined ? appTitle.trim() : firstLine(prompt)
  return line ? { ...session, title: shortened(line) } : session
}

export function titleAfterClaude(session: SessionTitle, generated: string): SessionTitle {
  const title = generated.trim()
  if (!title || session.titleRenamed || session.titleFromClaude) return session
  return { ...session, title, titleFromClaude: true }
}

/** As the extension: a title is asked for on at most this many prompts. */
const MAX_TITLE_REQUESTS = 3

export const titleRequests = (): number => 0

/**
 * The extension's `wantsGeneratedTitle`: the first prompt asks, the next ones ask again until a title comes back. A prompt
 * the app wrote never asks, so a session it started keeps the app's title for good.
 */
export function wantsClaudeTitle(
  requests: number,
  session: SessionTitle,
  firstPrompt: boolean,
  fromApp = false
): { ask: boolean; requests: number } {
  if (fromApp || session.titleRenamed || session.titleFromClaude) return { ask: false, requests }
  if (firstPrompt) return { ask: true, requests: 1 }
  if (requests === 0 || requests >= MAX_TITLE_REQUESTS) return { ask: false, requests }
  return { ask: true, requests: requests + 1 }
}

/** A session that starts a new conversation in place is named again by its next prompt, unless the user named it. */
export function titleAfterFreshStart(session: SessionTitle): SessionTitle {
  return session.titleRenamed ? session : { title: NEW_SESSION_TITLE }
}

export function titleAfterRename(session: SessionTitle, name: string): SessionTitle {
  const title = name.trim()
  return title ? { ...session, title, titleRenamed: true } : session
}

/** The title a session would have had, given its user messages in order. */
export function migratedTitle(userMessages: readonly string[]): string {
  return userMessages.reduce<SessionTitle>((t, text) => titleAfterPrompt(t, text), { title: NEW_SESSION_TITLE }).title
}
