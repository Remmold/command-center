import { createContext, useContext, type ReactNode } from 'react'

export type TimelineDot = 'neutral' | 'success' | 'error' | 'progress' | 'pending' | 'none'

/** Whether the rows above and below this one are timeline rows too, so the line runs on into them. */
export interface TimelinePlace {
  above: boolean
  below: boolean
}

export const ALONE: TimelinePlace = { above: false, below: false }
const PLACES: Record<string, TimelinePlace> = {
  'false,false': ALONE,
  'true,false': { above: true, below: false },
  'false,true': { above: false, below: true },
  'true,true': { above: true, below: true }
}

/** The shared object for a place, so a memoised row gets the same value each render. */
export function timelinePlace(above: boolean, below: boolean): TimelinePlace {
  return PLACES[`${above},${below}`]
}

const TimelinePlaceContext = createContext<TimelinePlace>(ALONE)
export const TimelinePlaceProvider = TimelinePlaceContext.Provider

const DOT: Record<Exclude<TimelineDot, 'none'>, string> = {
  neutral: 'bg-muted',
  success: 'bg-success',
  error: 'bg-error',
  progress: 'bg-muted animate-blink',
  pending: 'border border-faint'
}

const DOT_LABEL: Record<Exclude<TimelineDot, 'none' | 'neutral'>, string> = {
  success: 'succeeded',
  error: 'failed',
  progress: 'running',
  pending: 'no result yet'
}

// The extension's `.timelineMessage`: 8px above and below (24px above under a time), the 7px dot 7px lower, the line through its middle.
const PAD_TOP = { normal: 8, stamped: 24 }

interface Props {
  dot: TimelineDot
  /** A right-aligned time above the row. */
  stamp?: ReactNode
  children: ReactNode
}

/** One step of an assistant turn: a dot on a thin vertical line that joins it to the steps around it. */
export function TimelineRow({ dot, stamp, children }: Props) {
  const place = useContext(TimelinePlaceContext)
  const padTop = stamp ? PAD_TOP.stamped : PAD_TOP.normal
  const lineTop = place.above ? 0 : padTop + 10
  const lineVisible = place.above || place.below
  return (
    <div data-timeline-row="" className="relative pb-2 pl-[30px]" style={{ paddingTop: padTop }}>
      {lineVisible && (
        <span
          aria-hidden
          className="absolute left-[12px] w-px bg-subtle"
          style={place.below ? { top: lineTop, bottom: 0 } : { top: 0, height: padTop + 10 }}
        />
      )}
      {dot !== 'none' && (
        <span
          role={dot === 'neutral' ? undefined : 'img'}
          aria-hidden={dot === 'neutral' || undefined}
          aria-label={dot === 'neutral' ? undefined : DOT_LABEL[dot]}
          title={dot === 'neutral' ? undefined : DOT_LABEL[dot]}
          className={`absolute left-[9px] z-[1] h-[7px] w-[7px] rounded-full ${DOT[dot]}`}
          style={{ top: padTop + 7 }}
        />
      )}
      {stamp && <div className="absolute right-0 top-[4px]">{stamp}</div>}
      {children}
    </div>
  )
}

/** A timeline dot on its own, inline in a row of text, e.g. a list of agents. */
export function DotMark({ dot }: { dot: Exclude<TimelineDot, 'none' | 'neutral'> }) {
  return <span role="img" aria-label={DOT_LABEL[dot]} title={DOT_LABEL[dot]} className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT[dot]}`} />
}
