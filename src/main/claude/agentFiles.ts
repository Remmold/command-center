import { addToSummary, EMPTY_SUMMARY, type AgentSummary } from '../../shared/agentSummary'
import { TranscriptCursor } from '../observed/tail'

interface Entry {
  cursor: TranscriptCursor
  summary: AgentSummary
  reading: Promise<unknown>
}

export interface AgentFileRead {
  summary: AgentSummary
  /** It read new lines this time. */
  grew: boolean
  /** Bytes read so far: the file's size when it was read. */
  offset: number
}

/**
 * Each agent file's summary, kept between reads so a read only parses the bytes appended since the last one. The
 * Agents tab's watcher and the 60 s agent check share it, so neither reads a file twice.
 */
export class AgentFileCache {
  private entries = new Map<string, Entry>()

  constructor(private readonly max = 2000) {}

  /** The file's summary after reading what was appended; throws when it cannot be read. */
  read(file: string): Promise<AgentFileRead> {
    let entry = this.entries.get(file)
    if (entry) this.entries.delete(file)
    else entry = { cursor: new TranscriptCursor(file, 0, true), summary: EMPTY_SUMMARY, reading: Promise.resolve() }
    this.entries.set(file, entry)
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.max) break
      this.entries.delete(oldest)
    }
    const current = entry
    const next = current.reading.catch(() => undefined).then(() => this.readNew(current))
    current.reading = next
    return next
  }

  private async readNew(entry: Entry): Promise<AgentFileRead> {
    const { cursor } = entry
    const from = cursor.offset
    const restarts = cursor.restarts
    // A file that shrank is read again from its start, so its summary starts over too.
    const base = (): AgentSummary => (cursor.restarts !== restarts ? EMPTY_SUMMARY : entry.summary)
    let started = false
    // Kept after each chunk: a read that fails halfway has already moved the cursor past those lines.
    await cursor.readNew((items) => {
      entry.summary = addToSummary(started ? entry.summary : base(), items)
      started = true
    })
    if (!started) entry.summary = base()
    const grew = cursor.offset !== from || cursor.restarts !== restarts
    return { summary: entry.summary, grew, offset: cursor.offset }
  }
}

export const agentFiles = new AgentFileCache()
