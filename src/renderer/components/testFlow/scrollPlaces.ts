const places = new Map<string, number>()

const keyOf = (folder: string, name: string): string => `${folder}\n${name}`.toLowerCase()

/** Where a test-flow file was last scrolled to while the app runs; 0 for one not seen yet. */
export function scrollPlace(folder: string, name: string): number {
  return places.get(keyOf(folder, name)) ?? 0
}

export function keepScrollPlace(folder: string, name: string, y: number): void {
  places.set(keyOf(folder, name), y)
}
