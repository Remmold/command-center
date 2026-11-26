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
  // An unreadable file reads as empty: a broken file must not stop New feature in every workspace.
  const readAll = async (): Promise<Record<string, unknown>> => {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf-8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  const writeAll = async (all: Record<string, unknown>): Promise<void> => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(all, null, 2), 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  }
  return {
    get: (workspaceId: string): Promise<PreviewConfig | null> =>
      serial(async () => {
        const read = readPreviewConfig((await readAll())[workspaceId])
        return read.ok && !isEmptyPreviewConfig(read.config) ? read.config : null
      }),
    /** Validates `raw` first; other entries stay as they are, valid or not; a config with no install command and no servers removes the workspace's entry. */
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
