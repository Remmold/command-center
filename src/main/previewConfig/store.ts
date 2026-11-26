import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { isEmptyPreviewConfig, readPreviewConfig, type PreviewConfig } from '../../shared/previewConfig'

export type PreviewConfigSave = { ok: true; config: PreviewConfig | null } | { ok: false; error: string }

/** The saved preview configs by workspace id, one JSON file; operations run one at a time. */
export function createPreviewConfigStore(file: string) {
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next.catch(() => undefined)
    return next
  }
  const readAll = async (): Promise<Record<string, PreviewConfig>> => {
    let parsed: unknown
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf-8'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw err
    }
    const out: Record<string, PreviewConfig> = {}
    if (parsed && typeof parsed === 'object') {
      for (const [id, raw] of Object.entries(parsed)) {
        const read = readPreviewConfig(raw)
        if (read.ok) out[id] = read.config
      }
    }
    return out
  }
  const writeAll = async (all: Record<string, PreviewConfig>): Promise<void> => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(all, null, 2), 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  }
  return {
    get: (workspaceId: string): Promise<PreviewConfig | null> => serial(async () => (await readAll())[workspaceId] ?? null),
    /** Validates `raw` first; a config with no install command and no servers removes the workspace's entry. */
    save: (workspaceId: string, raw: unknown): Promise<PreviewConfigSave> =>
      serial(async () => {
        const read = readPreviewConfig(raw)
        if (!read.ok) return read
        const { [workspaceId]: _old, ...rest } = await readAll()
        const empty = isEmptyPreviewConfig(read.config)
        await writeAll(empty ? rest : { ...rest, [workspaceId]: read.config })
        return { ok: true, config: empty ? null : read.config }
      })
  }
}

export type PreviewConfigStore = ReturnType<typeof createPreviewConfigStore>
