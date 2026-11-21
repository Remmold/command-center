import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join } from 'node:path'
import {
  MAX_REPO_IMAGE_BYTES,
  MAX_REPO_IMAGE_LABEL,
  type ImageImportResult,
  type RepoIconChoice,
  type RepoIdentities,
  type RepoIdentity
} from '../../shared/repoIdentity'
import { IMAGE_FILE_NAME, parseRepoIdentities } from './validate'

export type ImportImageResult = ImageImportResult<RepoIdentities>

export function shortHash(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 32)
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')

function contentMismatch(ext: 'png' | 'svg', bytes: Buffer): string | null {
  if (ext === 'png' && !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'That file is not a PNG.'
  if (ext === 'svg' && !/<svg[\s>]/i.test(bytes.toString('utf-8', 0, 4096))) return 'That file is not an SVG.'
  return null
}

export interface RepoIdentityStore {
  list: () => Promise<RepoIdentities>
  /** An empty name falls back to the repo's folder name. */
  setDisplayName: (repoGroupKey: string, name: string) => Promise<RepoIdentities>
  /** undefined goes back to the letter. */
  setIcon: (repoGroupKey: string, icon: RepoIconChoice | undefined) => Promise<RepoIdentities>
  /** Copies the file into the icons folder, so the source can move or vanish afterwards. */
  importImage: (repoGroupKey: string, sourcePath: string) => Promise<ImportImageResult>
  imagePath: (file: string) => string
}

export function createRepoIdentityStore(dir: string): RepoIdentityStore {
  const file = join(dir, 'repo-identities.json')
  const imagesDir = join(dir, 'repo-icons')
  const imagePath = (name: string): string => {
    if (!IMAGE_FILE_NAME.test(name)) throw new Error(`not a repo icon file: ${name}`)
    return join(imagesDir, name)
  }
  let queue: Promise<unknown> = Promise.resolve()

  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.then(op, op)
    queue = next.catch(() => undefined)
    return next
  }

  const readAll = async (): Promise<RepoIdentities> => {
    try {
      return parseRepoIdentities(JSON.parse(await fs.readFile(file, 'utf-8')))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) return {}
      throw err
    }
  }

  const writeAll = async (all: RepoIdentities): Promise<void> => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(all, null, 2), 'utf-8')
    await fs.rename(`${file}.tmp`, file)
  }

  const imagesIn = (all: RepoIdentities): Set<string> =>
    new Set(Object.values(all).flatMap((i) => (i.icon?.kind === 'image' ? [i.icon.file] : [])))

  const applyChange = async (repoGroupKey: string, change: (current: RepoIdentity) => RepoIdentity) => {
    const all = await readAll()
    const before = imagesIn(all)
    const next = change(all[repoGroupKey] ?? {})
    if (next.displayName === undefined && next.icon === undefined) delete all[repoGroupKey]
    else all[repoGroupKey] = next
    await writeAll(all)
    const after = imagesIn(all)
    for (const unused of [...before].filter((f) => !after.has(f))) {
      await fs.rm(imagePath(unused), { force: true })
    }
    return all
  }

  const update = (repoGroupKey: string, change: (current: RepoIdentity) => RepoIdentity) =>
    serial(() => applyChange(repoGroupKey, change))

  return {
    list: () => serial(readAll),
    setDisplayName: (repoGroupKey, name) =>
      update(repoGroupKey, (current) => ({ ...current, displayName: name.trim() || undefined })),
    setIcon: (repoGroupKey, icon) => update(repoGroupKey, (current) => ({ ...current, icon })),
    importImage: (repoGroupKey, sourcePath) =>
      serial(async (): Promise<ImportImageResult> => {
        const ext = extname(sourcePath).slice(1).toLowerCase()
        if (ext !== 'png' && ext !== 'svg') return { ok: false, error: 'Choose a PNG or SVG file.' }
        if ((await fs.stat(sourcePath)).size > MAX_REPO_IMAGE_BYTES) {
          return { ok: false, error: `The image is over ${MAX_REPO_IMAGE_LABEL}.` }
        }
        const bytes = await fs.readFile(sourcePath)
        const error = contentMismatch(ext, bytes)
        if (error) return { ok: false, error }
        const name = `${shortHash(bytes)}.${ext}`
        await fs.mkdir(imagesDir, { recursive: true })
        await fs.writeFile(imagePath(name), bytes)
        const identities = await applyChange(repoGroupKey, (current) => ({
          ...current,
          icon: { kind: 'image', file: name }
        }))
        return { ok: true, identities }
      }),
    imagePath
  }
}
