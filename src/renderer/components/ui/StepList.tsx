import type { ReactNode } from 'react'

interface Props {
  label: string
  titles: readonly string[]
  current: number
  onPick: (step: number) => void
  /** The current step's body, shown under its title. */
  children: ReactNode
}

/** Numbered steps, each title a button; only the current one is open. */
export function StepList({ label, titles, current, onPick, children }: Props) {
  return (
    <ol aria-label={label} className="flex flex-col gap-1">
      {titles.map((title, n) => {
        const open = n === current
        return (
          <li key={title} aria-current={open ? 'step' : undefined} className={`flex flex-col gap-2 rounded border ${open ? 'border-subtle bg-widget pb-2' : 'border-transparent'}`}>
            <button
              type="button"
              onClick={() => onPick(n)}
              className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ${open ? 'font-semibold text-fg' : 'text-muted hover:bg-list-hover hover:text-fg'}`}
            >
              <span className="w-3 shrink-0 tabular-nums text-faint">{n + 1}</span>
              <span className="min-w-0 flex-1">{title}</span>
            </button>
            {open && <div className="flex flex-col gap-2 px-2 pl-7">{children}</div>}
          </li>
        )
      })}
    </ol>
  )
}
