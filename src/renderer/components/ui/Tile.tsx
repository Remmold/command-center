import type { ReactNode } from 'react'

interface Props {
  /** Matches a Connectors edge end. */
  nodeId: string
  label: string
  /** A short line under the label, e.g. the tokens. */
  meta?: ReactNode
  /** Small marks after the meta, e.g. icons for shared or read-only. */
  marks?: ReactNode
  width: number
  height: number
  selected: boolean
  /** Drawn dashed: it stands for several things. */
  stack?: boolean
  tooltip?: string
  onClick: () => void
}

/** A selectable box sized by what it weighs, for a map of blocks. */
export function Tile({ nodeId, label, meta, marks, width, height, selected, stack = false, tooltip, onClick }: Props) {
  return (
    <button
      type="button"
      data-node={nodeId}
      aria-pressed={selected}
      title={tooltip}
      onClick={onClick}
      style={{ width, height }}
      className={`relative flex max-w-full shrink-0 flex-col items-start justify-start gap-0.5 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-4 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ${stack ? 'border-dashed' : ''} ${
        selected ? 'border-focus bg-list-selected text-fg' : 'border-strong bg-widget text-fg hover:bg-list-hover'
      }`}
    >
      <span className="w-full truncate">{label}</span>
      {(meta || marks) && (
        <span className="flex w-full min-w-0 items-center gap-1 text-[10px] text-muted">
          {meta && <span className="truncate tabular-nums">{meta}</span>}
          {marks}
        </span>
      )}
    </button>
  )
}
