import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ObservedSession, ObservedStatus } from '../../shared/types'

export const LIVE_FOR_MS = 2 * 60_000
export const LISTED_FOR_MS = 30 * 60_000
const OBSERVED_ENTRYPOINT = 'claude-vscode'
const PROBE_BYTES = 64 * 1024
const ENTRYPOINT_RE = /"entrypoint":"((?:[^"\\]|\\.)*)"/g
const TITLE_RE = /"aiTitle":"((?:[^"\\]|\\.)*)"/g

export type ObservedTranscript = Omit<ObservedSession, 'workspaceId'>

export function observedStatus(modifiedAt: number, now: number): ObservedStatus | null {
  const age = now - modifiedAt
  if (age > LISTED_FOR_MS) return null
  return age <= LIVE_FOR_MS ? 'live' : 'quiet'
}

export async function listObservedTranscripts(
  dir: string,
  opts: { hostedSessionIds: ReadonlySet<string>; now: number }
): Promise<ObservedTranscript[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const listed: ObservedTranscript[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const sessionId = entry.slice(0, -'.jsonl'.length)
    if (opts.hostedSessionIds.has(sessionId)) continue
    const file = join(dir, entry)
    let stat
    try {
      stat = await fs.stat(file)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const modifiedAt = stat.mtimeMs
    const status = observedStatus(modifiedAt, opts.now)
    if (!status) continue
    const probe = await readProbe(file, stat.size)
    if (lastMatch(probe, ENTRYPOINT_RE) !== OBSERVED_ENTRYPOINT) continue
    listed.push({ sessionId, title: lastMatch(probe, TITLE_RE) ?? sessionId.slice(0, 8), modifiedAt, status })
  }
  return listed.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

/** Tail first so the most recent tag wins, then head; transcripts can be tens of MB. */
async function readProbe(file: string, size: number): Promise<string[]> {
  const handle = await fs.open(file, 'r')
  try {
    const read = async (position: number, length: number): Promise<string> => {
      const buf = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buf, 0, length, position)
      return buf.subarray(0, bytesRead).toString('utf-8')
    }
    if (size <= PROBE_BYTES * 2) return [await read(0, size)]
    return [await read(size - PROBE_BYTES, PROBE_BYTES), await read(0, PROBE_BYTES)]
  } finally {
    await handle.close()
  }
}

function lastMatch(chunks: string[], re: RegExp): string | null {
  for (const chunk of chunks) {
    let found: string | null = null
    for (const m of chunk.matchAll(re)) found = m[1]
    if (found !== null) {
      try {
        return JSON.parse(`"${found}"`) as string
      } catch {
        return found
      }
    }
  }
  return null
}
