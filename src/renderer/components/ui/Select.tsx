interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  options: readonly Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** A drop-down choice, for more options than a segmented control fits. */
export function Select({ label, options, value, onChange, disabled = false }: Props) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 max-w-full rounded border border-strong bg-input px-1.5 py-1 text-xs text-fg focus:border-focus focus:outline-none disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
