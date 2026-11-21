function stripMarkup(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1$2')
}

/** A progress note with its markdown emphasis, code and link markup removed. */
export function plainNote(text: string): string {
  return text
    .replace(/^\s*[-*+]\s+/, '')
    .split(/(`[^`]+`)/)
    .map((part) => (part.startsWith('`') && part.endsWith('`') && part.length > 1 ? part.slice(1, -1) : stripMarkup(part)))
    .join('')
}
