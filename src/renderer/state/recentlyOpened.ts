/**
 * The ids most recently opened first, `id` now at the front, at most `max` of them unless more are still open;
 * `dropped` are the oldest closed ones that fell off.
 */
export function touchRecent(order: readonly string[], id: string, max: number, open: ReadonlySet<string> = new Set()): { order: string[]; dropped: string[] } {
  const next = [id, ...order.filter((o) => o !== id)]
  let spare = next.length - max
  const dropped: string[] = []
  for (let i = next.length - 1; i > 0 && spare > 0; i--) {
    if (open.has(next[i])) continue
    dropped.push(next[i])
    spare--
  }
  return { order: next.filter((o) => !dropped.includes(o)), dropped }
}
