import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
}

export function Checkbox({ checked, onChange, children, disabled = false }: Props) {
  return (
    <label
      className={
        'inline-flex min-w-0 items-center gap-1.5 text-xs ' +
        (disabled ? 'cursor-default text-faint' : 'cursor-pointer text-fg')
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 shrink-0 accent-accent"
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  )
}
