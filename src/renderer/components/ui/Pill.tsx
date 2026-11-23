import type { LucideIcon } from 'lucide-react'
import type { Ref } from 'react'

interface Props {
  label: string
  /** Shown before the label; in a narrow prompt footer the pill shrinks to it. */
  icon?: LucideIcon
  onClick: () => void
  tooltip?: string
  expanded?: boolean
  popup?: 'menu' | 'dialog'
  /** The button's name when its label alone would not say what it sets. */
  ariaLabel?: string
  buttonRef?: Ref<HTMLButtonElement>
}

/** A rounded footer button that shows a current choice. */
export function Pill({ label, icon: Icon, onClick, tooltip, expanded, popup = 'menu', ariaLabel, buttonRef }: Props) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={ariaLabel}
      aria-haspopup={popup}
      aria-expanded={expanded}
      className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-input px-2 py-0.5 text-[11px] text-fg hover:bg-strong focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
    >
      {Icon && <Icon size={12} strokeWidth={2} className="shrink-0 text-muted" />}
      <span data-pill-label={Icon ? 'shrinks' : undefined} className="truncate">
        {label}
      </span>
    </button>
  )
}
