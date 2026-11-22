import { promises as fs, watch, type FSWatcher } from 'node:fs'
import type { ChatItem } from '../../shared/chatItems'
import { createTranscriptParser, transcriptLinesToItems } from './transcriptItems'

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
export async function readLastItems(file: string, maxItems: number, maxBytes: number): Promise<TranscriptTail> {
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
      items = [...transcriptLinesToItems(complete.split('\n')), ...items]
    }
    const shortened = position > 0 || items.length > maxItems
    // A last line still unterminated after maxBytes: follow from where reading stopped; its fragment fails to parse and is skipped.
    return { items: items.slice(-maxItems), offset: offset ?? position, shortened }
  } finally {
    await handle.close()
  }
}

const POLL_MS = 2000

/** Follows one transcript from `offset`, emitting the chat items of each newly completed line. */
export class TranscriptFollower {
  private watcher: FSWatcher | null = null
  private poll: NodeJS.Timeout | null = null
  private parser = createTranscriptParser()
  private reading: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(
    private readonly file: string,
    private offset: number,
    private readonly emit: (items: ChatItem[]) => void
  ) {
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
    let handle
    try {
      handle = await fs.open(this.file, 'r')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.stop()
      throw err
    }
    try {
      const { size } = await handle.stat()
      if (size < this.offset) {
        this.offset = 0
        this.parser = createTranscriptParser()
      }
      while (this.offset < size && !this.stopped) {
        const length = Math.min(CHUNK_BYTES, size - this.offset)
        const buf = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buf, 0, length, this.offset)
        if (bytesRead === 0) break
        this.offset += bytesRead
        const items = this.parser.push(buf.subarray(0, bytesRead))
        if (items.length > 0 && !this.stopped) this.emit(items)
      }
    } finally {
      await handle.close()
    }
  }
}
