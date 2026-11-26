import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { digestBody, renderFeatureDigest, type DigestFeature } from './digest'

const DEBOUNCE_MS = 500

export interface DigestWriterDeps {
  file: string
  features: () => Promise<DigestFeature[]>
  now?: () => number
  debounceMs?: number
}

/** The first line is the header with the write time, so only the text after it says whether the facts changed. */
async function bodyOnDisk(file: string): Promise<string | null> {
  try {
    const text = await fs.readFile(file, 'utf-8')
    return text.slice(text.indexOf('\n') + 1)
  } catch {
    return null
  }
}

/** Keeps the digest file current: written after a burst of changes settles, and only when its facts differ. Starts nothing and has no timer of its own. */
export function createDigestWriter(deps: DigestWriterDeps) {
  const now = deps.now ?? Date.now
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let writing: Promise<boolean> = Promise.resolve(false)

  const write = async (): Promise<boolean> => {
    const features = await deps.features()
    if ((await bodyOnDisk(deps.file)) === digestBody(features)) return false
    await fs.mkdir(dirname(deps.file), { recursive: true })
    await fs.writeFile(`${deps.file}.tmp`, renderFeatureDigest(features, now()), 'utf-8')
    await fs.rename(`${deps.file}.tmp`, deps.file)
    return true
  }

  /** Resolves true when the file was written, false when its facts were unchanged. */
  const flush = (): Promise<boolean> => {
    writing = writing.then(write).catch((err) => {
      console.error('[features] digest write failed', err)
      return false
    })
    return writing
  }

  return {
    flush,
    /** Any fact the digest names may have changed. */
    changed: (): void => {
      if (stopped) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void flush()
      }, deps.debounceMs ?? DEBOUNCE_MS)
    },
    stop: (): void => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }
}

export type DigestWriter = ReturnType<typeof createDigestWriter>
