export type MeterTone = 'ok' | 'warn' | 'limit'

const FILL: Record<MeterTone, string> = {
  ok: 'bg-meter-ok',
  warn: 'bg-meter-warn',
  limit: 'bg-meter-limit'
}

interface Props {
  /** 0-100; null draws an empty track. */
  percent: number | null
  tone: MeterTone
  label: string
  size?: 'compact' | 'fill'
  tooltip?: string
}

const TRACK = { compact: 'w-12', fill: 'w-full' } as const

export function Meter({ percent, tone, label, size = 'compact', tooltip }: Props) {
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent))
  return (
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
}
