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
}

export function Meter({ percent, tone, label }: Props) {
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent))
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className="block h-1 w-12 shrink-0 overflow-hidden rounded-full bg-list-selected"
    >
      <span className={`block h-full rounded-full ${FILL[tone]}`} style={{ width: `${width}%` }} />
    </span>
  )
}
