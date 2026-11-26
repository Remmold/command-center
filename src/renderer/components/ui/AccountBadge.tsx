import { forwardRef } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'

interface Props {
  label: string
  /** A word before the label for an account not yet confirmed, or guessed. */
  qualifier?: string | null
  tooltip: string
  /** The account differs from what it should be. */
  warning?: boolean
  /** Makes the badge a dropdown button with a chevron. */
  onClick?: () => void
  pressed?: boolean
  ariaLabel: string
}

const BASE =
  'inline-flex h-6 max-w-full shrink items-center gap-1 overflow-hidden rounded px-1 text-[11px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'

/** Which account something runs on, as quiet header text: its name and plan, "Personal · Ultra". */
export const AccountBadge = forwardRef<HTMLButtonElement, Props>(function AccountBadge(
  { label, qualifier, tooltip, warning = false, onClick, pressed = false, ariaLabel },
  ref
) {
  const body = (
    <>
      {warning && <AlertTriangle size={12} className="shrink-0 text-warning" aria-hidden />}
      {qualifier && <span className="hide-in-narrow-header shrink-0 italic">{qualifier}</span>}
      <span className="min-w-[3rem] truncate">{label}</span>
    </>
  )
  if (!onClick) {
    return (
      <span role="note" aria-label={ariaLabel} title={tooltip} className={`${BASE} text-muted`}>
        {body}
      </span>
    )
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      title={tooltip}
      className={`${BASE} ${pressed ? 'text-fg' : 'text-muted'} hover:text-fg`}
    >
      {body}
      <ChevronDown size={12} className="shrink-0" aria-hidden />
    </button>
  )
})
