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
  status: ToolCallStatus
  /** Right-aligned extras on the header, e.g. a diff's +/- counts. */
  meta?: ReactNode
  /** Folds the body behind the header, opening when this turns true; without it the body always shows, as in the extension. */
  foldable?: { defaultOpen: boolean }
  children?: ReactNode
}

const HEADER = 'flex w-full min-w-0 items-center gap-2 text-left text-[13px] leading-5'

/** One tool call as a timeline step: its header line and the IN/OUT boxes under it. */
export function ToolCallRow({ name, target, status, meta, foldable, children }: Props) {
  const defaultOpen = foldable?.defaultOpen ?? true
  const [open, setOpen] = useState(defaultOpen)
  // A live call's result arrives after the row mounts and may be what makes it open.
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])
  const title = (
    <>
      <span className="shrink-0 font-semibold text-fg">{name}</span>
      {target && <span className="min-w-0 truncate font-mono text-[12px] text-muted">{target}</span>}
      {status === 'error' && <span className="shrink-0 text-[11px] text-error">error</span>}
    </>
  )
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <TimelineRow dot={DOT[status]}>
      {foldable ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`group ${HEADER} rounded hover:bg-list-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus`}
        >
          {title}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {meta}
            <Chevron size={13} className="text-faint opacity-0 group-hover:opacity-100 group-aria-expanded:opacity-100" />
          </span>
        </button>
      ) : (
        <div className={HEADER}>
          {title}
          {meta && <span className="ml-auto flex shrink-0 items-center gap-2">{meta}</span>}
        </div>
      )}
      {open && children && <div className="mt-1">{children}</div>}
    </TimelineRow>
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
  children?: ReactNode
}

/** One labelled row of a tool body (IN, OUT, diff…); text clips to about three lines and expands on click. */
export function ToolCallSection({ label, tone = 'normal', text, children }: SectionProps) {
  const [expanded, setExpanded] = useState(false)
  const color = tone === 'error' ? 'text-error' : 'text-fg'
  const cell = 'col-span-2 grid grid-cols-subgrid border-t border-subtle p-1 first:border-t-0'
  const labelCell = (
    <div className="py-1 pl-1 pr-2 font-mono text-[11px] uppercase text-muted opacity-60">{label}</div>
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
  return (
    <div className={cell}>
      {labelCell}
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
          {expanded ? text : text.slice(0, COLLAPSED_CHARS)}
        </pre>
      </div>
    </div>
  )
}
