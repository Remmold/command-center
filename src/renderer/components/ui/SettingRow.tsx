import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icon: LucideIcon
  label: string
  /** Shown muted right after the label, e.g. the current value. */
  suffix?: string
  description?: string
  /** A control at the row's end, e.g. a slider; it handles its own clicks. */
  trailing?: ReactNode
  onClick: () => void
  tooltip?: string
}

/** A popover row that changes one setting, with its current value and a control. */
export function SettingRow({ icon: Icon, label, suffix, description, trailing, onClick, tooltip }: Props) {
  return (
    <div className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-fg hover:bg-list-hover">
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
      >
        <Icon size={14} strokeWidth={1.75} className="mt-px shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block">
            {label}
            {suffix && <span className="ml-1 text-muted">{suffix}</span>}
          </span>
          {description && <span className="block text-[11px] text-muted">{description}</span>}
        </span>
      </button>
      {trailing}
    </div>
  )
}
