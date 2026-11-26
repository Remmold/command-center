interface Option<T extends string> {
  value: T
  label: string
  title?: string
  disabled?: boolean
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-0.5 rounded-md bg-sidebar p-0.5">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={selected}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={
              'rounded px-2.5 py-1 text-xs transition-colors ' +
              (selected ? 'bg-list-selected text-fg' : 'text-muted hover:text-fg disabled:text-faint disabled:hover:text-faint')
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
