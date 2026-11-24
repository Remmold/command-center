import { promises as fs, watch, type FSWatcher } from 'node:fs'
import type { ChatItem } from '../../shared/chatItems'
import { createTranscriptParser, transcriptLinesToItems, type TranscriptParser } from './transcriptItems'

const CHUNK_BYTES = 512 * 1024
const NEWLINE = 0x0a

export interface TranscriptTail {
  items: ChatItem[]
  /** Byte offset just past the last complete line; following starts here. */
  offset: number
  /** True when older lines were left unread. */
  shortened: boolean
}

/** Reads backwards from the end until `maxItems` items are found or `maxBytes` were read. */
export async function readLastItems(file: string, maxItems: number, maxBytes: number, sidechain = false): Promise<TranscriptTail> {
  const handle = await fs.open(file, 'r')
  try {
    const { size } = await handle.stat()
    let position = size
    let carry = Buffer.alloc(0)
    let offset: number | null = null
    let items: ChatItem[] = []
    while (position > 0 && items.length < maxItems && size - position < maxBytes) {
      const length = Math.min(CHUNK_BYTES, position)
      position -= length
      const chunk = Buffer.alloc(length)
      await handle.read(chunk, 0, length, position)
      let buf = Buffer.concat([chunk, carry])
      if (offset === null) {
        const lastNewline = buf.lastIndexOf(NEWLINE)
        if (lastNewline < 0 && position > 0) {
          carry = buf
          continue
        }
        offset = position + lastNewline + 1
        buf = buf.subarray(0, lastNewline + 1)
      }
      const firstNewline = position > 0 ? buf.indexOf(NEWLINE) : -1
      carry = buf.subarray(0, firstNewline + 1)
      const complete = buf.subarray(firstNewline + 1).toString('utf-8')
      items = [...transcriptLinesToItems(complete.split('\n'), sidechain), ...items]
    }
    const shortened = position > 0 || items.length > maxItems
    // A last line still unterminated after maxBytes: follow from where reading stopped; its fragment fails to parse and is skipped.
    return { items: items.slice(-maxItems), offset: offset ?? position, shortened }
  } finally {
    await handle.close()
  }
}

/** The tail's poll cadence; other followers of transcript files poll no faster. */
export const POLL_MS = 2000

/** Reads a transcript from `offset` on, the chat items of each line completed since the last read; no timers of its own. */
export class TranscriptCursor {
  private parser: TranscriptParser
  /** How often the file shrank and was read again from its start. */
  restarts = 0

  constructor(
    private readonly file: string,
    private position: number,
    private readonly sidechain = false
  ) {
    this.parser = createTranscriptParser(sidechain)
  }

  /** Bytes read so far; the file's size when it is caught up. */
  get offset(): number {
    return this.position
  }

  /** Reads what was appended, handing each chunk's items to `emit`; a file that shrank is read again from its start. Throws when it cannot be opened. */
  async readNew(emit: (items: ChatItem[]) => void, stopped: () => boolean = () => false): Promise<void> {
    const handle = await fs.open(this.file, 'r')
    try {
      const { size } = await handle.stat()
      if (size < this.position) {
        this.position = 0
        this.parser = createTranscriptParser(this.sidechain)
        this.restarts++
      }
      while (this.position < size && !stopped()) {
        const length = Math.min(CHUNK_BYTES, size - this.position)
        const buf = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buf, 0, length, this.position)
        if (bytesRead === 0) break
        this.position += bytesRead
        const items = this.parser.push(buf.subarray(0, bytesRead))
        if (items.length > 0 && !stopped()) emit(items)
      }
    } finally {
      await handle.close()
    }
  }
}

/** Follows one transcript from `offset`, emitting the chat items of each newly completed line. */
export class TranscriptFollower {
  private watcher: FSWatcher | null = null
  private poll: NodeJS.Timeout | null = null
  private cursor: TranscriptCursor
  private reading: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(
    file: string,
    offset: number,
    private readonly emit: (items: ChatItem[]) => void,
    sidechain = false
  ) {
    this.cursor = new TranscriptCursor(file, offset, sidechain)
    try {
      this.watcher = watch(file, () => this.schedule())
      this.watcher.on('error', () => this.watcher?.close())
    } catch {
      this.watcher = null
    }
    // fs.watch on Windows can miss appends from another process; the poll is the backstop.
    this.poll = setInterval(() => this.schedule(), POLL_MS)
  }

  stop(): void {
    this.stopped = true
    this.watcher?.close()
    if (this.poll) clearInterval(this.poll)
    this.watcher = null
    this.poll = null
  }

  private schedule(): void {
    this.reading = this.reading.then(() => this.readNew()).catch((err) => {
      console.error('[observed] tail read failed', err)
    })
  }

  private async readNew(): Promise<void> {
    if (this.stopped) return
    try {
      await this.cursor.readNew(this.emit, () => this.stopped)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.stop()
      throw err
    }
  }
}
