import { createHash } from 'node:crypto'
import { createReadStream, promises as fs, statSync } from 'node:fs'
import { join } from 'node:path'
import { SPEECH_MODEL, type SpeechModel, type SpeechModelStatus } from '../../shared/video'

const RETRIES = 3
const REPORT_MS = 250

async function hashFile(path: string, hash: ReturnType<typeof createHash>): Promise<void> {
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
}

function sizeOf(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/** The speech model under `dir`: downloaded once with resume and retry, checked against its SHA-256. */
export class SpeechModelFile {
  private current: SpeechModelStatus
  private listeners = new Set<(status: SpeechModelStatus) => void>()
  private running: Promise<SpeechModelStatus> | null = null
  private abort: AbortController | null = null

  constructor(
    private readonly dir: string,
    private readonly model: SpeechModel = SPEECH_MODEL,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.current = sizeOf(this.file) === model.bytes ? { state: 'ready', bytes: model.bytes } : { state: 'absent' }
  }

  get file(): string {
    return join(this.dir, this.model.file)
  }

  private get part(): string {
    return `${this.file}.part`
  }

  status(): SpeechModelStatus {
    return this.current
  }

  /** The model's path once it is downloaded. */
  readyPath(): string | null {
    return this.current.state === 'ready' ? this.file : null
  }

  onChange(listener: (status: SpeechModelStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(status: SpeechModelStatus): SpeechModelStatus {
    this.current = status
    for (const listener of this.listeners) listener(status)
    return status
  }

  download(): Promise<SpeechModelStatus> {
    if (this.current.state === 'ready') return Promise.resolve(this.current)
    this.running ??= this.fetchWithRetries().finally(() => {
      this.running = null
      this.abort = null
    })
    return this.running
  }

  cancel(): void {
    this.abort?.abort()
  }

  async remove(): Promise<SpeechModelStatus> {
    this.cancel()
    await this.running?.catch(() => undefined)
    await fs.rm(this.file, { force: true })
    await fs.rm(this.part, { force: true })
    return this.set({ state: 'absent' })
  }

  private async fetchWithRetries(): Promise<SpeechModelStatus> {
    await fs.mkdir(this.dir, { recursive: true })
    this.abort = new AbortController()
    let error = ''
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        return await this.fetchOnce(this.abort.signal)
      } catch (err) {
        if (this.abort.signal.aborted) {
          error = 'Download cancelled'
          break
        }
        error = err instanceof Error ? err.message : String(err)
      }
    }
    const received = sizeOf(this.part) ?? 0
    return this.set({ state: 'failed', error, received, total: this.model.bytes })
  }

  /** Resumes from the partial file when the server honours the range. */
  private async fetchOnce(signal: AbortSignal): Promise<SpeechModelStatus> {
    const total = this.model.bytes
    let have = sizeOf(this.part) ?? 0
    if (have > total) {
      await fs.rm(this.part, { force: true })
      have = 0
    }
    const response = await this.fetchImpl(this.model.url, { signal, headers: have > 0 ? { Range: `bytes=${have}-` } : {} })
    if (!response.ok || !response.body) throw new Error(`The server answered ${response.status}`)
    if (response.status !== 206) have = 0
    const hash = createHash('sha256')
    if (have > 0) await hashFile(this.part, hash)
    const out = await fs.open(this.part, have > 0 ? 'a' : 'w')
    let received = have
    let reported = 0
    this.set({ state: 'downloading', received, total })
    try {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        await out.write(value)
        received += value.byteLength
        if (Date.now() - reported > REPORT_MS) {
          reported = Date.now()
          this.set({ state: 'downloading', received, total })
        }
      }
    } finally {
      await out.close()
    }
    if (received !== total || hash.digest('hex') !== this.model.sha256) {
      await fs.rm(this.part, { force: true })
      throw new Error('The downloaded model did not match its checksum')
    }
    await fs.rename(this.part, this.file)
    return this.set({ state: 'ready', bytes: total })
  }
}
