import type { ContextIndicator } from './contextUsage'
import { pieBucket } from './contextUsage'

// The extension's pre-drawn arcs for 50, 75 and 99% (`Wzn` filled, `Uzn` track).
const FILLED: Record<50 | 75 | 99, string> = {
  50: 'M10 5C10.6566 5 11.3068 5.12933 11.9134 5.3806C12.52 5.63188 13.0712 6.00017 13.5355 6.46447C13.9998 6.92876 14.3681 7.47995 14.6194 8.08658C14.8707 8.69321 15 9.34339 15 10C15 10.6566 14.8707 11.3068 14.6194 11.9134C14.3681 12.52 13.9998 13.0712 13.5355 13.5355C13.0712 13.9998 12.52 14.3681 11.9134 14.6194C11.3068 14.8707 10.6566 15 10 15',
  75: 'M10 5C10.9239 5 11.8298 5.256 12.617 5.73959C13.4043 6.22317 14.0422 6.91544 14.4599 7.73955C14.8776 8.56367 15.0587 9.4874 14.9833 10.4082C14.9079 11.3291 14.5788 12.211 14.0325 12.9562C13.4863 13.7013 12.7442 14.2805 11.8888 14.6295C11.0333 14.9785 10.0979 15.0837 9.18625 14.9333C8.27465 14.783 7.42253 14.383 6.72447 13.7777C6.02641 13.1724 5.50971 12.3856 5.23171 11.5045',
  99: 'M10 5C11.1568 5 12.2778 5.4011 13.172 6.13495C14.0662 6.8688 14.6783 7.89 14.9039 9.02455C15.1296 10.1591 14.9549 11.3368 14.4096 12.357C13.8643 13.3772 12.9821 14.1767 11.9134 14.6194C10.8447 15.0621 9.65554 15.1205 8.54858 14.7847C7.44161 14.4489 6.48532 13.7397 5.84265 12.7779C5.19998 11.816 4.91069 10.6611 5.02408 9.50991C5.13746 8.35871 5.6465 7.28243 6.46447 6.46447'
}
const TRACK: Record<50 | 75 | 99, string | null> = {
  50: 'M7.25907 5.81822C6.54939 6.28337 5.96977 6.92149 5.57477 7.67248C5.17978 8.42347 4.9824 9.26263 5.00123 10.111C5.02006 10.9593 5.25448 11.7889 5.6824 12.5216C6.11033 13.2543 6.7177 13.8661 7.44732 14.2993',
  75: 'M7.25907 5.81822C6.22763 6.49427 5.48242 7.52767 5.16666 8.71982',
  99: null
}

interface Props {
  indicator: ContextIndicator
  onCompact: () => void
}

/** The prompt footer's context pie (the extension's `jBt`); clicking it compacts. */
export function ContextPie({ indicator, onCompact }: Props) {
  const bucket = pieBucket(indicator.usedPercent)
  const track = TRACK[bucket]
  return (
    <button
      type="button"
      onClick={onCompact}
      aria-label={indicator.label}
      title={`${indicator.tooltip}\n${indicator.hint}`}
      className="inline-flex shrink-0 items-center rounded-sm p-0.5 text-muted hover:bg-list-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="block">
        {track && <path d={track} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5" strokeLinecap="round" />}
        <path d={FILLED[bucket]} className="stroke-clay" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}
