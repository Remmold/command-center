import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { readPreviewDraft, type PreviewDraftRead } from '../../shared/previewSetup'

const NAME = /^[A-Za-z0-9_-]{1,80}\.json$/

/** A fresh name for a draft file in the folder; nothing is written, Claude is the file's only writer. */
export async function beginPreviewDraft(folder: string, id: string): Promise<{ ok: true; file: string } | { ok: false; error: string }> {
  const name = `${id}.json`
  if (!NAME.test(name)) return { ok: false, error: `draft id ${id} is not a plain name` }
  try {
    await fs.mkdir(folder, { recursive: true })
    return { ok: true, file: join(folder, name) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const insideFolder = (folder: string, file: unknown): file is string =>
  typeof file === 'string' && NAME.test(basename(file)) && resolve(dirname(file)).toLowerCase() === resolve(folder).toLowerCase()

/** What the draft file holds now; a missing file waits, and a file outside the folder is refused. */
export async function readPreviewDraftFile(folder: string, file: unknown): Promise<PreviewDraftRead> {
  if (!insideFolder(folder, file)) return { kind: 'refused', error: 'That is not a preview draft file.' }
  try {
    return readPreviewDraft(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'waiting' }
    return { kind: 'refused', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Removes a draft file once it is read or given up on. */
export async function discardPreviewDraft(folder: string, file: unknown): Promise<void> {
  if (!insideFolder(folder, file)) return
  await fs.rm(file, { force: true })
}

const STALE_DRAFT_MS = 24 * 60 * 60 * 1000

/** Removes draft files left in the folder for more than a day, by a session that never answered. */
export async function sweepStalePreviewDrafts(folder: string, now: number): Promise<void> {
  const names = await fs.readdir(folder).catch(() => [] as string[])
  await Promise.all(
    names
      .filter((name) => NAME.test(name))
      .map(async (name) => {
        const file = join(folder, name)
        const stat = await fs.stat(file).catch(() => null)
        if (stat && now - stat.mtimeMs > STALE_DRAFT_MS) await fs.rm(file, { force: true })
      })
  )
}
