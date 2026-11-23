interface Props {
  label: string
  /** Muted text after the label. */
  detail?: string
  onClick: () => void
  tooltip?: string
  expanded?: boolean
}

/** A rounded footer button that shows a current choice. */
export function Pill({ label, detail, onClick, tooltip, expanded }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-haspopup="menu"
      aria-expanded={expanded}
      className="inline-flex min-w-0 shrink items-center rounded-full bg-input px-2 py-0.5 text-[11px] text-fg hover:bg-strong focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
    >
      <span className="truncate">{label}</span>
      {detail && <span data-pill-detail="" className="ml-1 shrink-0 text-muted">{detail}</span>}
    </button>
  )
}
