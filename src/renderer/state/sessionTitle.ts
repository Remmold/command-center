export const NEW_SESSION_TITLE = 'New session'

export interface SessionTitle {
  title: string
  /** Set once the user names the session; prompts never change the title after that. */
  titleRenamed?: boolean
}

function firstLine(text: string): string {
  return (text.split('\n').find((line) => line.trim() !== '') ?? '').replace(/\s+/g, ' ').trim()
}

const MAX_TITLE = 60

function shortened(line: string): string {
  return line.length <= MAX_TITLE ? line : line.slice(0, MAX_TITLE - 1).trimEnd() + '…'
}

/** Only the first prompt with text names a session, and never once it was renamed. */
export function titleAfterPrompt(session: SessionTitle, prompt: string): SessionTitle {
  if (session.titleRenamed || session.title !== NEW_SESSION_TITLE) return session
  const line = firstLine(prompt)
  return line ? { ...session, title: shortened(line) } : session
}

export function titleAfterRename(session: SessionTitle, name: string): SessionTitle {
  const title = name.trim()
  return title ? { ...session, title, titleRenamed: true } : session
}

/** The title a session would have had, given its user messages in order. */
export function migratedTitle(userMessages: readonly string[]): string {
  return userMessages.reduce<SessionTitle>((t, text) => titleAfterPrompt(t, text), { title: NEW_SESSION_TITLE }).title
}
