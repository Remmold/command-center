import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { FeatureRecord } from '../../shared/features'

function isRecord(x: unknown): x is FeatureRecord {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  return (
    typeof p.name === 'string' &&
    typeof p.workspaceId === 'string' &&
    typeof p.worktreePath === 'string' &&
    typeof p.branch === 'string' &&
    typeof p.sessionId === 'string' &&
    Array.isArray(p.ports) &&
    typeof p.startedAt === 'number' &&
    (p.completedAt === null || typeof p.completedAt === 'number')
  )
}

/** The feature records, one JSON file; operations run one at a time. */
export function createFeatureStore(file: string) {
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next.catch(() => undefined)
    return next
  }
  const readAll = async (): Promise<FeatureRecord[]> => {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf-8'))
      return Array.isArray(parsed) ? parsed.filter(isRecord) : []
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }
  const writeAll = async (records: FeatureRecord[]): Promise<void> => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(records, null, 2), 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  }
  return {
    list: (): Promise<FeatureRecord[]> => serial(readAll),
    add: (record: FeatureRecord): Promise<void> => serial(async () => writeAll([...(await readAll()), record])),
    setClaudeSessionId: (name: string, claudeSessionId: string): Promise<void> =>
      serial(async () => {
        const all = await readAll()
        if (!all.some((r) => r.name === name && r.claudeSessionId !== claudeSessionId)) return
        await writeAll(all.map((r) => (r.name === name ? { ...r, claudeSessionId } : r)))
      }),
    setPorts: (name: string, ports: number[]): Promise<void> =>
      serial(async () => writeAll((await readAll()).map((r) => (r.name === name ? { ...r, ports } : r)))),
    remove: (name: string): Promise<void> => serial(async () => writeAll((await readAll()).filter((r) => r.name !== name)))
  }
}

export type FeatureStore = ReturnType<typeof createFeatureStore>
