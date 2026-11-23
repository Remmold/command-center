export type MeterTone = 'neutral' | 'ok' | 'warn' | 'limit'

const FILL: Record<MeterTone, string> = {
  neutral: 'bg-muted',
  ok: 'bg-meter-ok',
  warn: 'bg-meter-warn',
  limit: 'bg-meter-limit'
}

/** How much of the meter's time window has passed, drawn as a thin line under the bar. */
export interface MeterElapsed {
  /** 0-100. */
  percent: number
  /** The reading runs ahead of the time passed. */
  ahead: boolean
}

interface Props {
  /** 0-100; null draws an empty track. */
  percent: number | null
  tone: MeterTone
  label: string
  size?: 'compact' | 'fill'
  tooltip?: string
  elapsed?: MeterElapsed | null
}

const TRACK = { compact: 'w-12', fill: 'w-full' } as const

const clamp = (n: number) => Math.min(100, Math.max(0, n))

export function Meter({ percent, tone, label, size = 'compact', tooltip, elapsed }: Props) {
  const width = percent === null ? 0 : clamp(percent)
  const bar = (
    <span
      role="meter"
      aria-label={label}
      title={tooltip}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={`block h-1 shrink-0 overflow-hidden rounded-full bg-meter-track ${TRACK[size]}`}
    >
      <span className={`block h-full rounded-full ${FILL[tone]}`} style={{ width: `${width}%` }} />
    </span>
  )
  if (!elapsed) return bar
  return (
    <span title={tooltip} className={`flex shrink-0 flex-col gap-px ${TRACK[size]}`}>
      {bar}
      <span
        role="meter"
        aria-label={`${label} time passed`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={elapsed.percent}
        data-pace={elapsed.ahead ? 'ahead' : 'on-track'}
        className="block h-[2px] w-full overflow-hidden rounded-full bg-meter-track/50"
      >
        <span className={`block h-full rounded-full ${elapsed.ahead ? 'bg-warning' : 'bg-faint'}`} style={{ width: `${clamp(elapsed.percent)}%` }} />
      </span>
    </span>
  )
}

const READING_TEXT: Record<MeterTone, string> = {
  neutral: 'text-muted',
  ok: 'text-muted',
  warn: 'text-meter-warn',
  limit: 'text-meter-limit'
}

interface ReadingProps {
  percent: number
  tone: MeterTone
  label: string
  /** A tiny window name before the bar, e.g. "5h". */
  prefix?: string | null
}

/** One window's bar and percentage on a single line; never shrinks or cuts. */
export function MeterReading({ percent, tone, label, prefix }: ReadingProps) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-normal tabular-nums ${READING_TEXT[tone]}`}>
      {prefix && <span className="text-[9px] text-faint">{prefix}</span>}
      <Meter percent={percent} tone={tone} label={label} />
      <span className="meter-reading-percent">{percent}%</span>
    </span>
  )
}
