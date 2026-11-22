import { useEffect, useRef, type ReactNode } from 'react'

/** A listbox that floats above the prompt; mouse-down keeps the caret in the input. */
export function SuggestionPopup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="absolute bottom-full left-0 right-0 z-20 mb-2 flex max-h-[50vh] flex-col overflow-hidden rounded-md border border-strong bg-widget shadow-xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div role="listbox" aria-label={label} className="scrollbar-thin flex max-h-[300px] flex-col overflow-y-auto pb-2 pt-1">
        {children}
      </div>
    </div>
  )
}

export function SuggestionEmpty({ children }: { children: ReactNode }) {
  return (
    <div role="option" aria-disabled="true" aria-selected={false} className="px-2 py-1.5 text-center text-xs text-muted">
      {children}
    </div>
  )
}

interface OptionProps {
  active: boolean
  icon?: ReactNode
  children: ReactNode
  /** Dimmed text after the label, such as a file's folder. */
  detail?: string
  onHover: () => void
  onPick: () => void
}

export function SuggestionOption({ active, icon, children, detail, onHover, onPick }: OptionProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onPick}
      className={'mx-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-fg ' + (active ? 'bg-list-selected' : '')}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="shrink-0 truncate">{children}</span>
      {detail && <span className="min-w-0 truncate text-muted">{detail}</span>}
    </div>
  )
}
