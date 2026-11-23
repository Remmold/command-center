import { forwardRef, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { AccountColor } from '../../state/accountColors'
import { ACCENT_EDGE } from './accountAccent'

interface Props {
  color: AccountColor | null
  label: string
  /** A word before the label for an account not yet confirmed, or guessed. */
  qualifier?: string | null
  tooltip: string
  /** The account differs from what it should be. */
  warning?: boolean
  /** Usage bars after the label. */
  meters?: ReactNode
  /** Makes the badge a button. */
  onClick?: () => void
  pressed?: boolean
  ariaLabel: string
}

const BASE =
  'account-badge-min inline-flex h-6 max-w-full shrink items-center overflow-hidden gap-1.5 rounded border border-l-[3px] px-1.5 text-[11px] text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'

/** Which account something runs on: its accent on the left edge, its name and plan, and optional usage bars. */
export const AccountBadge = forwardRef<HTMLButtonElement, Props>(function AccountBadge(
  { color, label, qualifier, tooltip, warning = false, meters, onClick, pressed = false, ariaLabel },
  ref
) {
  const edge = color ? ACCENT_EDGE[color] : 'border-l-strong'
  const frame = warning ? 'border-warning' : 'border-subtle'
  const surface = pressed ? 'bg-list-selected' : 'bg-widget'
  const look = `${BASE} ${edge} ${frame} ${surface} ${qualifier ? 'border-dashed' : ''}`
  const body = (
    <>
      {warning && <AlertTriangle size={12} className="shrink-0 text-warning" aria-hidden />}
      {qualifier && <span className="hide-in-narrow-header shrink-0 italic text-muted">{qualifier}</span>}
      <span className="min-w-[3rem] truncate font-medium">{label}</span>
      {meters && <span className="hide-in-tight-header inline-flex shrink-0">{meters}</span>}
    </>
  )
  if (!onClick) {
    return (
      <span role="note" aria-label={ariaLabel} title={tooltip} className={look}>
        {body}
      </span>
    )
  }
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label={ariaLabel} aria-pressed={pressed} title={tooltip} className={`${look} hover:bg-list-hover`}>
      {body}
    </button>
  )
})
