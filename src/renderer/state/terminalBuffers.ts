/** Readers for the shell panes on screen, by pane id; a pane that is not mounted has none. */
const readers = new Map<string, () => string>()

export function registerTerminalReader(paneId: string, read: () => string): () => void {
  readers.set(paneId, read)
  return () => {
    if (readers.get(paneId) === read) readers.delete(paneId)
  }
}

export function readTerminal(paneId: string): string | null {
  return readers.get(paneId)?.() ?? null
}
