import { Search } from 'lucide-react'

interface Props {
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
}

/** A live filter input; Escape clears it. */
export function SearchField({ label, placeholder, value, onChange }: Props) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-500 focus-within:border-zinc-500">
      <Search size={12} className="shrink-0" />
      <input
        aria-label={label}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
        className="w-full min-w-0 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
      />
    </label>
  )
}
