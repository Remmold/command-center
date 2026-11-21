interface Option<T extends string> {
  value: T
  label: string
  title?: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-0.5 rounded-md bg-zinc-900 p-0.5">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={selected}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={
              'rounded px-2.5 py-1 text-xs transition-colors ' +
              (selected ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
