import { forwardRef, type ReactNode } from 'react'

/** A stage filling the rest of a pane, e.g. a canvas, with an optional scrolling column of details on its right. */
export function StageLayout({ children, aside, asideLabel }: { children: ReactNode; aside?: ReactNode; asideLabel?: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-editor">{children}</div>
      {aside && (
        <aside aria-label={asideLabel} className="scrollbar-thin flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-subtle px-3 py-3">
          {aside}
        </aside>
      )}
    </div>
  )
}

type CanvasProps = { label: string; state?: string }

/** A canvas filling its stage; `state` is exposed as `data-state` for what draws on it. */
export const StageCanvas = forwardRef<HTMLCanvasElement, CanvasProps>(function StageCanvas({ label, state }, ref) {
  return <canvas ref={ref} aria-label={label} data-state={state} className="absolute inset-0 block h-full w-full outline-none" />
})

/** A line over the middle of the stage, e.g. while it loads. */
export function StageNotice({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warning' }) {
  return (
    <div role="status" className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-xs ${tone === 'warning' ? 'text-warning' : 'text-muted'}`}>
      {children}
    </div>
  )
}
