import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}

export function Checkbox({ checked, onChange, children }: Props) {
  return (
    <label className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-xs text-fg">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 shrink-0 accent-accent"
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  )
}
