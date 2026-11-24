import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TimelineRow, type TimelineDot } from '../ui/Timeline'

export type ToolCallStatus = 'pending' | 'running' | 'ok' | 'error' | 'stopped'

const DOT: Record<ToolCallStatus, TimelineDot> = {
  pending: 'pending',
  running: 'progress',
  ok: 'success',
  error: 'error',
  stopped: 'error'
}

interface Props {
  name: ReactNode
  /** The muted text after the name; a file name is a link. */
  target: ReactNode
  /** The target is plain words, not code, e.g. a shell call's description. */
  prose?: boolean
  status: ToolCallStatus
  /** Right-aligned extras on the header, e.g. a diff's +/- counts. */
  meta?: ReactNode
  /** The body starts open; otherwise it folds behind the header until clicked. A live call's result may turn this true after mount. */
  defaultOpen?: boolean
  /** Lines that show under the header even while the body is folded, e.g. an error's first line. */
  note?: ReactNode
  /** A quiet line: the name reads muted, as a plain note rather than a tool. */
  quiet?: boolean
  /** Makes the header a button that opens the call elsewhere, e.g. an agent's live view; the body then always shows. */
  onOpen?: () => void
  children?: ReactNode
}

const HEADER = 'flex w-full min-w-0 items-center gap-2 text-left text-[13px] leading-5'
const FOCUS = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'

/** One tool call as a timeline step: its one-line header, and the IN/OUT boxes under it that open on click. */
export function ToolCallRow({ name, target, prose = false, status, meta, defaultOpen = false, note, quiet = false, onOpen, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])
  const title = (
    <>
      <span className={`shrink-0 ${quiet ? 'text-muted' : 'font-semibold text-fg'}`}>{name}</span>
      {target && <span className={`min-w-0 truncate text-muted ${prose ? '' : 'font-mono text-[12px]'}`}>{target}</span>}
      {status === 'error' && <span className="shrink-0 text-[11px] text-error">error</span>}
    </>
  )
  const foldable = !onOpen && !!children
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <TimelineRow dot={DOT[status]}>
      {foldable ? (
        // The whole line toggles on click like the extension's summary; the chevron is the keyboard and screen-reader control, so links in the line stay links.
        <div data-tool-header="" onClick={() => setOpen((o) => !o)} className={`group ${HEADER} cursor-pointer rounded hover:bg-list-hover`}>
          {title}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {meta}
            <button
              type="button"
              aria-expanded={open}
              aria-label={typeof name === 'string' ? name : 'Details'}
              title={open ? 'Hide details' : 'Show details'}
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              className={`rounded text-faint opacity-0 group-hover:opacity-100 aria-expanded:opacity-100 focus-visible:opacity-100 ${FOCUS}`}
            >
              <Chevron size={13} />
            </button>
          </span>
        </div>
      ) : onOpen ? (
        <button type="button" onClick={onOpen} className={`${HEADER} rounded hover:bg-list-hover ${FOCUS}`}>
          {title}
          {meta && <span className="ml-auto flex shrink-0 items-center gap-2">{meta}</span>}
        </button>
      ) : (
        <div className={HEADER}>
          {title}
          {meta && <span className="ml-auto flex shrink-0 items-center gap-2">{meta}</span>}
        </div>
      )}
      {note}
      {(open || onOpen) && children && <div className="mt-1">{children}</div>}
    </TimelineRow>
  )
}

/** A failed call's first line, shown under its header while the body is folded. */
export function ToolCallErrorLine({ text }: { text: string }) {
  return (
    <div data-tool-error="" className="truncate text-[12px] leading-5 text-error" title={text}>
      {text}
    </div>
  )
}

/** The extension's `toolBody` box holding a call's IN and OUT rows. */
export function ToolCallBody({ children }: { children: ReactNode }) {
  return <div className="my-1 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] overflow-hidden rounded-[5px] border border-subtle bg-sidebar">{children}</div>
}

const COLLAPSED_CHARS = 4000

interface SectionProps {
  label: string
  tone?: 'normal' | 'error'
  /** Plain text clips to a few lines and opens to the whole on click; other content shows in full. */
  text?: string
  /** The whole JSON behind a "raw" toggle, when the text shows only part of it. */
  raw?: string
  /** A line above the text, e.g. where a too-large output was saved. */
  lead?: ReactNode
  children?: ReactNode
}

/** One labelled row of a tool body (IN, OUT, diff…); text clips to about three lines and expands on click. */
export function ToolCallSection({ label, tone = 'normal', text, raw, lead, children }: SectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const color = tone === 'error' ? 'text-error' : 'text-fg'
  const cell = 'col-span-2 grid grid-cols-subgrid border-t border-subtle p-1 first:border-t-0'
  const labelCell = (
    <div className="flex flex-col items-start py-1 pl-1 pr-2 font-mono text-[11px] text-muted">
      <span className="uppercase opacity-60">{label}</span>
      {raw !== undefined && (
        <button
          type="button"
          aria-pressed={showRaw}
          title={showRaw ? 'Show the readable text' : 'Show the whole JSON'}
          onClick={() => setShowRaw((r) => !r)}
          className="mt-0.5 rounded text-[10px] opacity-60 hover:underline hover:opacity-100 aria-pressed:text-link aria-pressed:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
        >
          raw
        </button>
      )}
    </div>
  )
  if (text === undefined) {
    return (
      <div className={cell}>
        {labelCell}
        <div className={`min-w-0 overflow-auto ${color}`}>{children}</div>
      </div>
    )
  }
  const toggle = () => setExpanded((e) => !e)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    toggle()
  }
  const clip = tone === 'error' ? 'max-h-[10em] [mask-image:linear-gradient(to_bottom,black_calc(10em-10px),transparent_10em)]' : 'max-h-[60px] [mask-image:linear-gradient(to_bottom,black_50px,transparent_60px)]'
  const shown = showRaw && raw !== undefined ? raw : text
  const body = (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      title={expanded ? 'Click to fold' : 'Click to show all'}
      onClick={toggle}
      onKeyDown={onKey}
      data-tool-section={label}
      className={`min-w-0 cursor-pointer p-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ${color} ${expanded ? 'max-h-[60vh] overflow-auto' : `overflow-hidden ${clip}`}`}
    >
      <pre className={`font-mono text-[12px] leading-[18px] ${expanded || tone === 'error' ? 'whitespace-pre-wrap break-words' : 'overflow-hidden text-ellipsis whitespace-pre'}`}>
        {expanded ? shown : shown.slice(0, COLLAPSED_CHARS)}
      </pre>
    </div>
  )
  return (
    <div className={cell}>
      {labelCell}
      {lead ? (
        <div className="min-w-0">
          <div className="px-1 pt-1 text-[12px] leading-[18px]">{lead}</div>
          {shown && body}
        </div>
      ) : (
        body
      )}
    </div>
  )
}
