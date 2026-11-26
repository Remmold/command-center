import { useRef, useState } from 'react'

interface Props {
  label: string
  placeholder?: string
  initialValue?: string
  autoFocus?: boolean
  /** Leaving the field submits it (or cancels when empty), like renaming in VS Code. */
  submitOnBlur?: boolean
  /** Keeps the text after Enter, for a field that shows a saved value. */
  keepOnSubmit?: boolean
  disabled?: boolean
  /** Called with the trimmed text on Enter; empty text is ignored. */
  onSubmit: (value: string) => void
  onCancel?: () => void
}

/** A one-line input that submits on Enter and cancels on Escape. */
export function TextField({ label, placeholder, initialValue = '', autoFocus, submitOnBlur, keepOnSubmit = false, disabled = false, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  // Enter and Escape unmount the field in most callers; the blur that follows must not act again.
  const settled = useRef(false)
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        settled.current = false
        setValue(e.target.value)
      }}
      onFocus={submitOnBlur ? (e) => e.target.select() : undefined}
      onBlur={
        submitOnBlur
          ? () => {
              if (settled.current) return
              settled.current = true
              if (value.trim()) onSubmit(value.trim())
              else onCancel?.()
            }
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          settled.current = true
          onSubmit(value.trim())
          if (!keepOnSubmit) setValue('')
        } else if (e.key === 'Escape' && onCancel) {
          e.stopPropagation()
          settled.current = true
          onCancel()
        }
      }}
      className="w-full min-w-0 rounded border border-strong bg-input px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-focus focus:outline-none"
    />
  )
}
