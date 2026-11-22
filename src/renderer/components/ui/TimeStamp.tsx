/** A small muted time with its full form on hover. */
export function TimeStamp({ at, label, title }: { at: number; label: string; title: string }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={title} data-message-stamp="" className="cursor-default whitespace-nowrap text-[11px] leading-4 text-faint">
      {label}
    </time>
  )
}
