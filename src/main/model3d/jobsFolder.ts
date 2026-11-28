import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { MODEL3D_JOB_ID } from '../../shared/model3d'

export const SERVICE_FILE = 'service.json'
export const requestFile = (folder: string, id: string): string => join(folder, `${id}.request.json`)
export const statusFile = (folder: string, id: string): string => join(folder, `${id}.status.json`)

const REQUEST = /^(.+)\.request\.json$/
const STATUS = /^(.+)\.status\.json$/

/** The job ids that have a request file, and those that have a status file. */
export async function listJobFiles(folder: string): Promise<{ requests: string[]; statuses: Set<string> }> {
  const names = await fs.readdir(folder).catch(() => [] as string[])
  const requests: string[] = []
  const statuses = new Set<string>()
  for (const name of names) {
    const r = REQUEST.exec(name)
    if (r && MODEL3D_JOB_ID.test(r[1])) requests.push(r[1])
    const s = STATUS.exec(name)
    if (s && MODEL3D_JOB_ID.test(s[1])) statuses.add(s[1])
  }
  return { requests, statuses }
}

/** The parsed JSON in the file; `missing` when there is no file, `unreadable` when it is not JSON (yet). */
export async function readJson(file: string): Promise<{ kind: 'ok'; value: unknown } | { kind: 'missing' } | { kind: 'unreadable' }> {
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'unreadable' }
  }
  try {
    return { kind: 'ok', value: JSON.parse(text) as unknown }
  } catch {
    return { kind: 'unreadable' }
  }
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

export async function removeJobFiles(folder: string, id: string): Promise<void> {
  await Promise.all([fs.rm(requestFile(folder, id), { force: true }), fs.rm(statusFile(folder, id), { force: true })])
}
