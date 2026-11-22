import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export type ToolCallStatus = 'pending' | 'running' | 'ok' | 'error' | 'stopped'

const GLYPH: Record<ToolCallStatus, string> = {
  pending: 'border border-faint',
  running: 'bg-status-running animate-pulse',
  ok: 'bg-success',
  error: 'bg-error',
  stopped: 'bg-error'
}

const GLYPH_LABEL: Record<ToolCallStatus, string> = {
  pending: 'no result yet',
  running: 'running',
  ok: 'succeeded',
  error: 'failed',
  stopped: 'stopped'
}

interface Props {
  name: string
  target: string
  status: ToolCallStatus
  /** Right-aligned extras on the collapsed row, e.g. a diff's +/- counts. */
  meta?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/** One tool call as a compact row that expands to its details. */
export function ToolCallRow({ name, target, status, meta, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  // A live call's result arrives after the row mounts and may be what makes it open.
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="text-[13px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-list-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus"
      >
        <span role="img" aria-label={GLYPH_LABEL[status]} title={GLYPH_LABEL[status]} className={`h-2 w-2 shrink-0 rounded-full ${GLYPH[status]}`} />
        <span className="shrink-0 font-semibold text-fg">{name}</span>
        {target && <span className="min-w-0 truncate font-mono text-[12px] text-muted">{target}</span>}
        {status === 'error' && <span className="shrink-0 text-[11px] text-error">error</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {meta}
          <Chevron size={13} className="text-faint opacity-0 group-hover:opacity-100 group-aria-expanded:opacity-100" />
        </span>
      </button>
      {open && <div className="ml-[9px] mt-1 border-l border-subtle pl-3">{children}</div>}
    </div>
  )
}

/** A labelled block inside an expanded tool call, e.g. its input or its result. */
export function ToolCallSection({ label, tone = 'normal', children }: { label: string; tone?: 'normal' | 'error'; children: ReactNode }) {
  return (
    <div className="mb-1 flex min-w-0 overflow-hidden rounded border border-subtle bg-sidebar">
      <div className="w-10 shrink-0 border-r border-subtle px-1.5 py-1.5 text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`max-h-72 min-w-0 flex-1 overflow-auto ${tone === 'error' ? 'text-error' : 'text-fg'}`}>{children}</div>
    </div>
  )
}

/** Preformatted monospace text inside a tool call section. */
export function ToolCallText({ children }: { children: string }) {
  return <pre className="whitespace-pre-wrap break-words px-2.5 py-1.5 font-mono text-[12px] leading-[18px]">{children}</pre>
}
