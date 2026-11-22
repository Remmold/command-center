import type { ReactNode } from 'react'

interface Props {
  label: string
  icon?: ReactNode
  /** The hover text; it is also what a screen reader hears for a pill that is not a link. */
  tooltip: string
  /** `on` is the tinted look of something live or starting. */
  tone?: 'on' | 'plain'
  /** Makes the pill a link that opens in the browser. */
  href?: string
  /** Makes the pill a button. */
  onClick?: () => void
}

const BASE = 'inline-flex min-w-0 shrink items-center gap-1 rounded-full px-2 py-0.5 text-[11px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'
const TONES = { on: 'bg-clay text-fg', plain: 'bg-input text-fg' }

/** A rounded footer pill that shows a state, like the extension's Remote Control pill. */
export function StatusPill({ label, icon, tooltip, tone = 'plain', href, onClick }: Props) {
  const body = (
    <>
      {icon}
      <span className="truncate">{label}</span>
    </>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={tooltip} aria-label={label} className={`${BASE} ${TONES[tone]} hover:brightness-110`}>
        {body}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={tooltip} className={`${BASE} ${TONES[tone]} hover:brightness-110`}>
        {body}
      </button>
    )
  }
  return (
    <span role="status" title={tooltip} aria-label={tooltip} className={`${BASE} ${TONES[tone]}`}>
      {body}
    </span>
  )
}
