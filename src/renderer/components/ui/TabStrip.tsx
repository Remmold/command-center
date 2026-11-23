interface Tab<T extends string> {
  value: T
  label: string
  /** Shown after the label, e.g. "Media 3". */
  count?: number
  title?: string
}

interface Props<T extends string> {
  tabs: readonly Tab<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

/** A slim row of underlined tabs across the top of a pane, like VS Code's panel tabs. */
export function TabStrip<T extends string>({ tabs, value, onChange, label }: Props<T>) {
  return (
    <div role="tablist" aria-label={label} data-tab-strip="" className="flex h-7 shrink-0 items-stretch gap-3 overflow-hidden border-b border-subtle px-5">
      {tabs.map((t) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={t.title}
            onClick={() => onChange(t.value)}
            className={
              'flex shrink-0 items-center gap-1 border-b text-xs transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ' +
              (selected ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg')
            }
          >
            {t.label}
            {t.count !== undefined && <span className="tabular-nums">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
