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

/** One reading: its words, cut short if need be, and its gauge at the end. */
export function MeterLine({ text, tooltip, gauge }: { text: string; tooltip: string; gauge: ReactNode }) {
  return (
    <li title={tooltip} className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-muted">
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {gauge}
    </li>
  )
}
