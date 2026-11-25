import { useEffect, useState } from 'react'

interface Props {
  label: string
  value: string
  /** Called with the trimmed text on Enter or on leaving the field, when it changed. */
  onCommit: (value: string) => void
}

/** A one-line folder path kept in the field: Enter or leaving it saves, Escape puts the saved value back. */
export function FolderField({ label, value, onCommit }: Props) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = (): void => {
    const clean = text.trim()
    if (clean && clean !== value) onCommit(clean)
    else setText(value)
  }
  return (
    <input
      aria-label={label}
      value={text}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') {
          e.stopPropagation()
          setText(value)
        }
      }}
      className="w-full min-w-0 rounded border border-strong bg-input px-2 py-1 font-mono text-xs text-fg focus:border-focus focus:outline-none"
    />
  )
}
