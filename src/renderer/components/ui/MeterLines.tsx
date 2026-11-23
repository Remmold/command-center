import type { ReactNode } from 'react'
import type { AccountColor } from '../../state/accountColors'
import { ACCENT_EDGE } from './accountAccent'

/** A small stack of reading lines, ruled on the left in an accent. */
export function MeterLines({ label, color, children }: { label: string; color: AccountColor | null; children: ReactNode }) {
  return (
    <ul aria-label={label} className={`ml-[18px] mr-2 mb-1 flex flex-col gap-0.5 border-l-2 pl-2 ${color ? ACCENT_EDGE[color] : 'border-l-strong'}`}>
      {children}
    </ul>
  )
}

interface MeterLineProps {
  /** e.g. "Week 95%"; never cut. */
  head: string
  /** e.g. "ahead of pace by 38%"; never cut. */
  verdict?: string | null
  /** e.g. "resets Mon 23:59"; the only part cut short. */
  reset?: string | null
  tooltip: string
  gauge: ReactNode
}

/** One reading on a line with its gauge; in a narrow Work list the verdict and reset drop to a second line. */
export function MeterLine({ head, verdict, reset, tooltip, gauge }: MeterLineProps) {
  const detail = [verdict, reset].filter(Boolean)
  return (
    <li title={tooltip} className="meter-line min-w-0 text-[11px] leading-4 text-muted">
      <span className="meter-line-head whitespace-nowrap">{head}</span>
      {detail.length > 0 && (
        <span className="meter-line-detail flex min-w-0 gap-1 whitespace-nowrap">
          <span aria-hidden className="meter-line-sep">·</span>
          {verdict && <span className="meter-line-verdict shrink-0">{verdict}</span>}
          {verdict && reset && <span aria-hidden>·</span>}
          {reset && <span className="min-w-0 truncate">{reset}</span>}
        </span>
      )}
      <span className="meter-line-gauge flex">{gauge}</span>
    </li>
  )
}
