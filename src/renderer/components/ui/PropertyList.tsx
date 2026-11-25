/** Labelled values one under the other, each value wrapping in full. */
export function PropertyList({ label, entries }: { label: string; entries: [string, string][] }) {
  return (
    <dl role="group" aria-label={label} className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted">{key}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
