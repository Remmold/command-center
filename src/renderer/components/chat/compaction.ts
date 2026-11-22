import type { ChatItem, CompactMetadata } from './types'

/** The extension's `WAt` summary line. */
export function compactLabel(meta: CompactMetadata | undefined): string {
  const thousands = meta ? Math.round(meta.preTokens / 1000) : 0
  return `Compacted chat · ${meta?.trigger === 'manual' ? 'manual' : 'auto'} · ${thousands}k tokens freed`
}

export interface CompactPairs {
  /** Each boundary's summary, by the boundary's id. */
  summaryFor: ReadonlyMap<string, string>
  /** Summary items already drawn inside their boundary's line. */
  drawnInBoundary: ReadonlySet<string>
}

/** Joins each compaction boundary with the summary right after it, as the extension's `pendingCompactMessage`. */
export function pairCompactions(items: ChatItem[]): CompactPairs {
  const summaryFor = new Map<string, string>()
  const drawnInBoundary = new Set<string>()
  items.forEach((item, i) => {
    const next = items[i + 1]
    if (item.kind !== 'system' || !item.compact || next?.kind !== 'system' || next.compactSummary === undefined) return
    summaryFor.set(item.id, next.compactSummary)
    drawnInBoundary.add(next.id)
  })
  return { summaryFor, drawnInBoundary }
}

/** The stream's `compact_metadata` (`trigger`, `pre_tokens`) in the transcript's shape. */
export function compactMetadata(raw: unknown): CompactMetadata {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    trigger: typeof o.trigger === 'string' ? o.trigger : 'auto',
    preTokens: typeof o.pre_tokens === 'number' ? o.pre_tokens : 0
  }
}
