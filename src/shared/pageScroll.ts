/** The message a sandboxed page and the app trade its scroll place in: `{ type, y }` both ways. */
export const PAGE_SCROLL_MESSAGE = 'cc-page-scroll'

const MAX_SCROLL = 10_000_000

/** The scroll place a message carries, or null when it is not one. */
export function pageScrollOf(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null
  const { type, y } = data as { type?: unknown; y?: unknown }
  if (type !== PAGE_SCROLL_MESSAGE || typeof y !== 'number' || !Number.isFinite(y)) return null
  return Math.min(Math.max(0, y), MAX_SCROLL)
}
