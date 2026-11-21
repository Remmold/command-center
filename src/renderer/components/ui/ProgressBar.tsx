interface Props {
  value: number
  max: number
  label: string
}

export function ProgressBar({ value, max, label }: Props) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800"
      >
        <span className="block h-full rounded-full bg-progress" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-[10px] tabular-nums text-zinc-500">
        {value}/{max}
      </span>
    </span>
  )
}
