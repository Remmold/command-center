import { formatOpenWork, type OpenWorkReport } from '../../shared/openWork'

/** A scan takes seconds of git, so a digest written sooner than this after the last one reuses it. */
export const OPEN_WORK_TTL_MS = 60_000

export interface OpenWorkSectionDeps {
  scan: () => Promise<OpenWorkReport>
  now?: () => number
  ttlMs?: number
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err)).trim().split(/\r?\n/)[0]

export interface OpenWorkSection {
  (): Promise<string>
  /** Forgets the last scan, so the next call scans again: a card adopted or removed work. */
  invalidate: () => void
}

/**
 * The digest's Open work section, scanned when asked but at most once per `ttlMs`; callers during a scan share it.
 * A failed scan never rejects: it yields its failure line, kept as long as a result would be.
 */
export function createOpenWorkSection(deps: OpenWorkSectionDeps): OpenWorkSection {
  const now = deps.now ?? Date.now
  const ttl = deps.ttlMs ?? OPEN_WORK_TTL_MS
  let cached: { at: number; text: Promise<string> } | null = null
  const section = (): Promise<string> => {
    if (cached && now() - cached.at < ttl) return cached.text
    const at = now()
    const text = Promise.resolve()
      .then(deps.scan)
      .then(formatOpenWork)
      .catch((err: unknown) => `Open work: scan failed (${reason(err)})\n`)
    cached = { at, text }
    return text
  }
  return Object.assign(section, {
    invalidate: () => {
      cached = null
    }
  })
}
