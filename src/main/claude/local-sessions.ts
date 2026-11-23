import { promises as fs, createReadStream } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { LocalSessionInfo, LocalSessionTitleSource } from '../../shared/types'

export type TranscriptListing = Pick<LocalSessionInfo, 'title' | 'titleSource' | 'preview' | 'gitBranch'>

const PREVIEW_CHARS = 160

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

function firstText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const block = content.find((c): c is { type: 'text'; text: string } => c?.type === 'text' && typeof c.text === 'string' && c.text.trim() !== '')
  return block?.text ?? ''
}

const stringField = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

const TITLE_MARKERS = ['"custom-title"', '"ai-title"', '"last-prompt"', '"summary"']
const GIT_BRANCH = /"gitBranch":"((?:[^"\\]|\\.)*)"/g

/** Reads a transcript line by line; only lines that can carry a title or the first prompt are parsed. */
class ListingCollector {
  private custom: string | undefined
  private ai: string | undefined
  private lastPrompt: string | undefined
  private summary: string | undefined
  private preview = ''
  private gitBranch: string | undefined

  add(raw: string): void {
    for (const m of raw.matchAll(GIT_BRANCH)) if (m[1]) this.gitBranch = m[1]
    const wanted = TITLE_MARKERS.some((marker) => raw.includes(marker)) || (!this.preview && raw.includes('"user"'))
    if (!wanted) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const record = parsed as Record<string, unknown>
    if (record.type === 'custom-title') this.custom = stringField(record, 'customTitle') ?? this.custom
    else if (record.type === 'ai-title') this.ai = stringField(record, 'aiTitle') ?? this.ai
    else if (record.type === 'last-prompt') this.lastPrompt = stringField(record, 'lastPrompt') ?? this.lastPrompt
    else if (record.type === 'summary') this.summary = stringField(record, 'summary') ?? this.summary
    else if (!this.preview && record.type === 'user') {
      const message = record.message as { role?: string; content?: unknown } | undefined
      if (message?.role === 'user') this.preview = collapse(firstText(message.content)).slice(0, PREVIEW_CHARS)
    }
  }

  /** As the extension's listing: custom-title ?? ai-title ?? last-prompt ?? summary ?? first prompt, the latest of each. */
  listing(): TranscriptListing {
    const [title, titleSource]: [string, LocalSessionTitleSource] = this.custom
      ? [this.custom, 'renamed']
      : this.ai
        ? [this.ai, 'claude']
        : [collapse(this.lastPrompt ?? this.summary ?? this.preview), 'prompt']
    return { title, titleSource, preview: this.preview, ...(this.gitBranch ? { gitBranch: this.gitBranch } : {}) }
  }
}

export function transcriptListing(lines: Iterable<string>): TranscriptListing {
  const collector = new ListingCollector()
  for (const line of lines) collector.add(line)
  return collector.listing()
}

const MAX_TITLE_CODE_POINTS = 200
// Control, bidirectional and zero-width characters, as the CLI's `rename_session` describes them.
const UNPRINTABLE_RUN = /[\p{Cc}\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]+/gu

/** The title the CLI stores for a rename: unprintable runs become one space, trimmed, at most 200 code points. */
export function cleanSessionTitle(title: string): string {
  return [...title.replace(UNPRINTABLE_RUN, ' ').trim()].slice(0, MAX_TITLE_CODE_POINTS).join('').trimEnd()
}

const PLAIN_SESSION_ID = /^[A-Za-z0-9-]+$/

/** The extension's rename of a session with no CLI process: a `custom-title` line at the end of its transcript. */
export async function appendCustomTitle(dir: string, sessionId: string, title: string): Promise<boolean> {
  if (!PLAIN_SESSION_ID.test(sessionId)) return false
  const customTitle = cleanSessionTitle(title)
  if (!customTitle) return false
  const file = join(dir, `${sessionId}.jsonl`)
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return false
    await fs.appendFile(file, JSON.stringify({ type: 'custom-title', sessionId, customTitle }) + '\n', 'utf-8')
    return true
  } catch {
    return false
  }
}

async function readListing(filePath: string): Promise<TranscriptListing> {
  const collector = new ListingCollector()
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf-8' }) })
  try {
    for await (const line of rl) collector.add(line)
  } catch {
    // a transcript that cannot be read lists with what was read
  }
  return collector.listing()
}

const listings = new Map<string, { mtimeMs: number; size: number; listing: TranscriptListing }>()

/** Reads a transcript again only once it has changed since the last listing. */
async function cachedListing(file: string, mtimeMs: number, size: number): Promise<TranscriptListing> {
  const known = listings.get(file)
  if (known && known.mtimeMs === mtimeMs && known.size === size) return known.listing
  const listing = await readListing(file)
  listings.set(file, { mtimeMs, size, listing })
  return listing
}

/** Lists the transcripts in one project's folder, e.g. from `transcriptsDirForWorkspace`; untitled ones are left out, as in the extension. */
export async function listLocalSessions(dir: string): Promise<LocalSessionInfo[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  for (const file of listings.keys()) {
    if (dirname(file) === join(dir) && !entries.includes(basename(file))) listings.delete(file)
  }
  const sessions: LocalSessionInfo[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const full = join(dir, entry)
    let stat
    try {
      stat = await fs.stat(full)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const listing = await cachedListing(full, stat.mtimeMs, stat.size)
    if (!listing.title) continue
    sessions.push({ sessionId: entry.replace(/\.jsonl$/, ''), modifiedAt: stat.mtime.getTime(), ...listing })
  }
  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return sessions
}
