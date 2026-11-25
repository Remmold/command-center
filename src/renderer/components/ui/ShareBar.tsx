const SWATCHES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6', 'bg-chart-7', 'bg-chart-8']

export interface ShareSegment {
  label: string
  value: number
  /** Shown on hover between the label and the percentage, e.g. the value written out. */
  detail?: string
}

interface Props {
  label: string
  segments: readonly ShareSegment[]
}

const percent = (value: number, total: number): number => Math.round((value / total) * 100)

/** A slim full-width bar split into each segment's share of their sum; nothing when the sum is 0. */
export function ShareBar({ label, segments }: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) return null
  const summary = segments.map((s) => `${s.label} ${percent(s.value, total)}%`).join(', ')
  return (
    <div role="img" aria-label={`${label}: ${summary}`} className="flex h-1.5 w-full shrink-0 gap-px overflow-hidden rounded-full bg-meter-track">
      {segments.map((s, n) =>
        s.value > 0 ? (
          <span
            key={s.label}
            title={`${s.label}: ${s.detail ? `${s.detail}, ` : ''}${percent(s.value, total)}%`}
            className={`h-full ${SWATCHES[n % SWATCHES.length]}`}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ) : null
      )}
    </div>
  )
}
