import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover } from './Popover'

export interface MultiSelectOption {
  value: string
  label: string
  icon?: ReactNode
  /** Small text after the label, e.g. the repo of a feature. */
  hint?: string
}

interface Props {
  label: string
  options: MultiSelectOption[]
  /** Empty means "all". */
  selected: string[]
  onChange: (selected: string[]) => void
}

function summary(options: MultiSelectOption[], selected: string[]): string {
  const chosen = options.filter((o) => selected.includes(o.value))
  if (chosen.length === 0) return 'All'
  if (chosen.length === 1) return chosen[0].label
  return `${chosen.length} selected`
}

/** A toolbar button opening a checkable list; nothing ticked means everything. */
export function MultiSelect({ label, options, selected, onChange }: Props) {
  const anchor = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const toggle = (value: string): void =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  const active = options.some((o) => selected.includes(o.value))

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          'inline-flex min-w-0 shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ' +
          (active ? 'border-zinc-500 bg-zinc-800 text-zinc-100' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200')
        }
      >
        <span className="text-zinc-500">{label}:</span>
        <span className="max-w-40 truncate">{summary(options, selected)}</span>
        <ChevronDown size={12} />
      </button>
      <Popover open={open} onClose={close} anchor={anchor.current} label={label}>
        <ul role="menu" aria-label={label} className="scrollbar-thin flex max-h-80 flex-col overflow-y-auto">
          <MultiSelectRow checked={!active} onClick={() => onChange([])}>
            All
          </MultiSelectRow>
          {options.map((o) => (
            <MultiSelectRow key={o.value} checked={selected.includes(o.value)} onClick={() => toggle(o.value)} hint={o.hint}>
              {o.icon}
              <span className="min-w-0 truncate">{o.label}</span>
            </MultiSelectRow>
          ))}
        </ul>
      </Popover>
    </>
  )
}

interface RowProps {
  checked: boolean
  onClick: () => void
  hint?: string
  children: ReactNode
}

function MultiSelectRow({ checked, onClick, hint, children }: RowProps) {
  return (
    <li>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={onClick}
        className="flex w-full min-w-0 items-center gap-1.5 px-3 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <span className="flex w-3 shrink-0 justify-center">{checked && <Check size={12} />}</span>
        {children}
        {hint && <span className="ml-auto shrink-0 pl-2 text-[10px] text-zinc-500">{hint}</span>}
      </button>
    </li>
  )
}
