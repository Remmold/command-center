import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { MODEL3D_JOB_ID, type Model3dRequest, type Model3dStatus } from '../../shared/model3d'

export const SERVICE_FILE = 'service.json'
export const requestName = (id: string): string => `${id}.request.json`
export const statusName = (id: string): string => `${id}.status.json`

const REQUEST = /^(.+)\.request\.json$/

/** The job ids among these file names that have a request file. */
export function requestIds(names: readonly string[]): string[] {
  const ids: string[] = []
  for (const name of names) {
    const r = REQUEST.exec(name)
    if (r && MODEL3D_JOB_ID.test(r[1])) ids.push(r[1])
  }
  return ids
}

/** A file's parsed JSON; `missing` when there is no file, `unreadable` when it is not JSON (yet). */
export type ReadResult = { kind: 'ok'; value: unknown } | { kind: 'missing' } | { kind: 'unreadable' }

/** The jobs folder as the 3D service sees it: one request file and one status file per job id. */
export interface JobsFolder {
  ensure(): Promise<void>
  /** The ids that have a request file. */
  requests(): Promise<string[]>
  readRequest(id: string): Promise<ReadResult>
  readStatus(id: string): Promise<ReadResult>
  writeRequest(id: string, request: Model3dRequest): Promise<void>
  /** Atomically: gen3d.py polls it. */
  writeStatus(id: string, status: Model3dStatus): Promise<void>
  remove(id: string): Promise<void>
}

export function parseJsonText(text: string): ReadResult {
  try {
    return { kind: 'ok', value: JSON.parse(text) as unknown }
  } catch {
    return { kind: 'unreadable' }
  }
}

export async function readJson(file: string): Promise<ReadResult> {
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'unreadable' }
  }
  return parseJsonText(text)
}

const RENAME_TRIES = 10
const RENAME_RETRY_MS = 30

/** Writes through a temp file and a rename, so a reader never sees half a file. A reader holding the file open on Windows makes the rename fail for a moment; it is retried. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`
  await fs.writeFile(temp, JSON.stringify(value, null, 2))
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(temp, file)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= RENAME_TRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        await fs.rm(temp, { force: true })
        throw err
      }
      await new Promise((r) => setTimeout(r, RENAME_RETRY_MS))
    }
  }
}

/** The jobs folder on disk. */
export function diskJobsFolder(folder: string): JobsFolder {
  const file = (name: string): string => join(folder, name)
  return {
    ensure: async () => {
      await fs.mkdir(folder, { recursive: true })
    },
    requests: async () => requestIds(await fs.readdir(folder).catch(() => [] as string[])),
    readRequest: (id) => readJson(file(requestName(id))),
    readStatus: (id) => readJson(file(statusName(id))),
    writeRequest: (id, request) => writeJsonAtomic(file(requestName(id)), request),
    writeStatus: (id, status) => writeJsonAtomic(file(statusName(id)), status),
    remove: async (id) => {
      await Promise.all([fs.rm(file(requestName(id)), { force: true }), fs.rm(file(statusName(id)), { force: true })])
    }
  }
}
