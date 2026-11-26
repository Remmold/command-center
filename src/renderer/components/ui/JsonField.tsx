import { useState } from 'react'

interface Props {
  label: string
  value: unknown
  disabled?: boolean
  /** Called on leaving the box with the parsed value, only when the text parses and differs. */
  onChange: (value: unknown) => void
}

const MAX_ROWS = 8

const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) ?? ''

/** A small box of raw JSON; text that does not parse shows its parse message and changes nothing. */
export function JsonField({ label, value, disabled = false, onChange }: Props) {
  const text = jsonText(value)
  const [shown, setShown] = useState(text)
  const [draft, setDraft] = useState(text)
  const [error, setError] = useState<string | null>(null)
  if (shown !== text) {
    setShown(text)
    setDraft(text)
    setError(null)
  }
  const leave = () => {
    if (draft === text) return setError(null)
    try {
      const parsed: unknown = JSON.parse(draft)
      setError(null)
      onChange(parsed)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <div>
      <textarea
        aria-label={label}
        aria-invalid={error !== null}
        disabled={disabled}
        spellCheck={false}
        rows={Math.min(MAX_ROWS, draft.split('\n').length)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={leave}
        className={`w-full min-w-0 resize-y rounded border bg-input px-2 py-1 font-mono text-[11px] text-fg focus:border-focus focus:outline-none ${error ? 'border-error' : 'border-strong'}`}
      />
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] text-error">
          Not valid JSON: {error}
        </p>
      )}
    </div>
  )
}
