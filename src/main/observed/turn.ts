import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { observedTurn, type CliProcessStatus, type ObservedTurn } from '../../shared/takeOver'
import { LIVE_FOR_MS } from './listing'

const FIRST_READ_BYTES = 256 * 1024
const MAX_READ_BYTES = 8 * 1024 * 1024
const MAX_STATUS_FILE_BYTES = 256 * 1024
const MESSAGE_LINE_RE = /"type":"(?:user|assistant)"/
const PROCESS_STATUSES: ReadonlySet<string> = new Set(['busy', 'shell', 'idle', 'waiting'])

/** The latest complete lines, read backwards until one is a message or `MAX_READ_BYTES` were read. */
export async function readLastLines(file: string): Promise<string[]> {
  const handle = await fs.open(file, 'r')
  try {
    const { size } = await handle.stat()
    for (let length = FIRST_READ_BYTES; ; length *= 2) {
      const start = Math.max(0, size - length)
      const buf = Buffer.alloc(size - start)
      const { bytesRead } = await handle.read(buf, 0, buf.length, start)
      const lines = buf.subarray(0, bytesRead).toString('utf-8').split('\n')
      lines.pop()
      if (start > 0) lines.shift()
      if (start === 0 || length >= MAX_READ_BYTES || lines.some((l) => MESSAGE_LINE_RE.test(l))) return lines
    }
  } finally {
    await handle.close()
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

interface LiveRecord {
  status: CliProcessStatus
  updatedAt: number
}

/** The newest record a running CLI keeps for the session in `<config>/sessions/<pid>.json`, as the extension reads it. */
async function liveRecord(sessionsDir: string, sessionId: string): Promise<LiveRecord | undefined> {
  let entries: string[]
  try {
    entries = await fs.readdir(sessionsDir)
  } catch {
    return undefined
  }
  let found: LiveRecord | undefined
  for (const entry of entries) {
    if (!/^\d+\.json$/.test(entry)) continue
    try {
      const file = join(sessionsDir, entry)
      if ((await fs.stat(file)).size > MAX_STATUS_FILE_BYTES) continue
      const record = JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>
      if (record.sessionId !== sessionId || typeof record.status !== 'string' || !PROCESS_STATUSES.has(record.status)) continue
      if (typeof record.pid !== 'number' || !alive(record.pid)) continue
      const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0
      if (!found || updatedAt > found.updatedAt) found = { status: record.status as CliProcessStatus, updatedAt }
    } catch {
      continue
    }
  }
  return found
}

export async function readProcessStatus(sessionsDir: string, sessionId: string): Promise<CliProcessStatus | undefined> {
  return (await liveRecord(sessionsDir, sessionId))?.status
}

/** The config folder a running CLI has the session in, by its process file; the newest wins. */
export async function liveConfigDir(configDirs: readonly string[], sessionId: string): Promise<string | null> {
  const records = await Promise.all(configDirs.map((dir) => liveRecord(join(dir, 'sessions'), sessionId)))
  let best: { dir: string; updatedAt: number } | null = null
  for (const [i, record] of records.entries()) {
    if (record && (!best || record.updatedAt > best.updatedAt)) best = { dir: configDirs[i], updatedAt: record.updatedAt }
  }
  return best?.dir ?? null
}

export async function readTurn(file: string, sessionsDir: string, sessionId: string, now: number): Promise<ObservedTurn> {
  const [lines, { mtimeMs }, cli] = await Promise.all([readLastLines(file), fs.stat(file), readProcessStatus(sessionsDir, sessionId)])
  return observedTurn({ lines, live: now - mtimeMs <= LIVE_FOR_MS, process: cli })
}
