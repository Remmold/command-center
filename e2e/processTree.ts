export interface ProcessRow {
  pid: number
  parent: number
  /** CreationDate ticks as text; empty when Windows reports none. */
  started: string
}

const ticks = (p: ProcessRow): bigint => (/^\d+$/.test(p.started) ? BigInt(p.started) : -1n)

/**
 * A process and everything it started. Windows keeps a dead parent's PID on its children and reuses PIDs,
 * so an unrelated older process (VS Code was killed this way) can name the test app as its parent; a real
 * child is always created after its parent, so anything older is not part of the tree.
 */
export function treeOf(root: number, table: readonly ProcessRow[]): ProcessRow[] {
  const tree = table.filter((p) => p.pid === root)
  for (let i = 0; i < tree.length; i++) {
    const parent = tree[i]
    tree.push(...table.filter((p) => p.parent === parent.pid && p.pid !== parent.pid && ticks(p) >= ticks(parent) && ticks(p) >= 0n))
  }
  return tree
}
