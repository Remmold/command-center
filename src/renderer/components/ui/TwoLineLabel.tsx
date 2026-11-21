/** A short label with a smaller muted line under it, for tight spaces like the title bar. */
export function TwoLineLabel({ primary, secondary }: { primary: string; secondary?: string | null }) {
  return (
    <span className="flex min-w-0 max-w-[11rem] flex-col items-start leading-tight">
      <span className="max-w-full truncate text-[11px]">{primary}</span>
      {secondary && <span className="max-w-full truncate text-[10px] text-muted">{secondary}</span>}
    </span>
  )
}
