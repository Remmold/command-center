import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  label: string
  description?: string
  onClick: () => void
  disabled?: boolean
  /** Marks the current choice in a pick-one menu. */
  checked?: boolean
}

/** One action in a popover menu. */
export function MenuItem({ icon: Icon, label, description, onClick, disabled, checked }: Props) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left text-xs text-fg hover:bg-list-hover focus-visible:bg-list-hover focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon size={14} strokeWidth={1.75} className="mt-px shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {description && <span className="block text-[11px] text-muted">{description}</span>}
      </span>
      {checked && <span className="shrink-0 text-[11px] text-muted">active</span>}
    </button>
  )
}
