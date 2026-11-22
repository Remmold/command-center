import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const MARKER = '"teleported-from"'

/** The extension's `hve`: a transcript line `{"type":"teleported-from","remoteSessionId":…}`. */
export function hasTeleportMarker(text: string): boolean {
  if (!text.includes(MARKER)) return false
  return text.split('\n').some((line) => {
    if (!line.includes(MARKER)) return false
    try {
      const parsed = JSON.parse(line) as { type?: unknown; remoteSessionId?: unknown }
      return parsed.type === 'teleported-from' && parsed.remoteSessionId !== undefined
    } catch {
      return false
    }
  })
}

/** True for a session teleported from elsewhere; an unreadable transcript counts as teleported, as the extension skips auto-enable then. */
export async function isTeleportedSession(transcripts: string, sessionId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return false
  let text: string
  try {
    text = await fs.readFile(join(transcripts, `${sessionId}.jsonl`), 'utf-8')
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ENOENT'
  }
  return hasTeleportMarker(text)
}
