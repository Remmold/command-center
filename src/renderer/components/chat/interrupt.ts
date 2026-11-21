import type { ContentBlock } from '../../../shared/types'

const NOTES = new Map([
  ['[Request interrupted by user]', 'Interrupted'],
  ['[Request interrupted by user for tool use]', 'Tool interrupted']
])

/** The note the extension shows for a user-message block the CLI writes on interrupt, or null. */
export function interruptNote(block: ContentBlock): string | null {
  if (block.type !== 'text') return null
  return NOTES.get((block as { text: string }).text) ?? null
}
