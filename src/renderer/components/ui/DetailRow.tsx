/** A muted label with its value on the right, as in an info panel. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 truncate text-fg" title={value}>
        {value}
      </span>
    </div>
  )
}
