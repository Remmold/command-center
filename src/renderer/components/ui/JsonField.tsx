import { useEffect, useRef, useState } from 'react'
import { draftFor, isUnparsed, leaveDraft, typeDraft, valueChanged } from './jsonDraft'

interface Props {
  label: string
  value: unknown
  disabled?: boolean
  /** Called on leaving the box with the parsed value, only when the text parses and differs. */
  onChange: (value: unknown) => void
  /** Told whether the box holds text not yet taken as its value, and false once it unmounts. */
  onUnparsedChange?: (unparsed: boolean) => void
}

const MAX_ROWS = 8

/** A small box of raw JSON; text that does not parse shows its parse message and changes nothing. */
export function JsonField({ label, value, disabled = false, onChange, onUnparsedChange }: Props) {
  const [box, setBox] = useState(() => draftFor(value))
  const synced = valueChanged(box, value)
  if (synced !== box) setBox(synced)
  const unparsed = isUnparsed(synced)
  const report = useRef(onUnparsedChange)
  report.current = onUnparsedChange
  useEffect(() => {
    report.current?.(unparsed)
    return () => report.current?.(false)
  }, [unparsed])
  const leave = () => {
    const left = leaveDraft(synced)
    setBox(left.box)
    if (left.parsed) onChange(left.parsed.value)
  }
  return (
    <div>
      <textarea
        aria-label={label}
        aria-invalid={synced.error !== null}
        disabled={disabled}
        spellCheck={false}
        rows={Math.min(MAX_ROWS, synced.draft.split('\n').length)}
        value={synced.draft}
        onChange={(e) => setBox(typeDraft(synced, e.target.value))}
        onBlur={leave}
        className={`w-full min-w-0 resize-y rounded border bg-input px-2 py-1 font-mono text-[11px] text-fg focus:border-focus focus:outline-none ${synced.error ? 'border-error' : 'border-strong'}`}
      />
      {synced.error && (
        <p role="alert" className="mt-0.5 text-[11px] text-error">
          Not valid JSON: {synced.error}
        </p>
      )}
    </div>
  )
}
