import { useState } from 'react'

interface Props {
  label: string
  placeholder?: string
  initialValue?: string
  autoFocus?: boolean
  /** Called with the trimmed text on Enter; empty text is ignored. */
  onSubmit: (value: string) => void
  onCancel?: () => void
}

/** A one-line input that submits on Enter and cancels on Escape. */
export function TextField({ label, placeholder, initialValue = '', autoFocus, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          onSubmit(value.trim())
          setValue('')
        } else if (e.key === 'Escape' && onCancel) {
          e.stopPropagation()
          onCancel()
        }
      }}
      className="w-full min-w-0 rounded border border-strong bg-input px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-focus focus:outline-none"
    />
  )
}
