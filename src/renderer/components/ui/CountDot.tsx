const TONE = { warning: 'text-warning', muted: 'text-muted' } as const

/** A coloured dot with a number beside it, e.g. a block's problems; `label` says what is counted. */
export function CountDot({ count, tone, label }: { count: number; tone: keyof typeof TONE; label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 items-center gap-0.5 tabular-nums ${TONE[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {count}
    </span>
  )
}
