/** A raw JSON box: the value it was given as text, the text in the box, and the parse message of the last leave. */
export interface JsonDraft {
  text: string
  draft: string
  error: string | null
}

const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) ?? ''

export const draftFor = (value: unknown): JsonDraft => {
  const text = jsonText(value)
  return { text, draft: text, error: null }
}

/** The box holds text its value does not: typed, not left yet, or left without parsing. */
export const isUnparsed = (box: JsonDraft): boolean => box.draft !== box.text

export const typeDraft = (box: JsonDraft, draft: string): JsonDraft => ({ ...box, draft })

/** The value changed from outside: a clean box shows it, a box being typed in keeps its text. The same box when nothing changed. */
export function valueChanged(box: JsonDraft, value: unknown): JsonDraft {
  const text = jsonText(value)
  if (text === box.text) return box
  if (!isUnparsed(box) || box.draft === text) return draftFor(value)
  return { ...box, text }
}

/** Leaving the box parses changed text; `parsed` is set only when it parses. */
export function leaveDraft(box: JsonDraft): { box: JsonDraft; parsed?: { value: unknown } } {
  if (!isUnparsed(box)) return { box: { ...box, error: null } }
  try {
    const value: unknown = JSON.parse(box.draft)
    return { box: { ...box, draft: jsonText(value), error: null }, parsed: { value } }
  } catch (err) {
    return { box: { ...box, error: (err as Error).message } }
  }
}
