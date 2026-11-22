/** `items` sorted by their place in `ids`; any the list leaves out follow in their old order. */
export function inOrder<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const at = new Map(ids.map((id, i) => [id, i]))
  return items
    .map((item, i) => ({ item, rank: at.get(item.id) ?? ids.length + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.item)
}

export function toEnd<T extends { id: string }>(items: readonly T[], id: string): T[] {
  const moved = items.find((x) => x.id === id)
  return moved ? [...items.filter((x) => x !== moved), moved] : [...items]
}
