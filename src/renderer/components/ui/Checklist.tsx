import { useEffect, useRef } from 'react'

export type CheckState = 'unchecked' | 'mixed' | 'checked'

export interface ChecklistEntry {
  label: string
  state: CheckState
}

function ReadOnlyCheck({ state }: { state: CheckState }) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      readOnly
      disabled
      className="mt-[3px] h-3 w-3 shrink-0 accent-accent"
    />
  )
}

/** A read-only list of checkbox items; checked ones are struck through and dimmed. */
export function Checklist({ entries }: { entries: ChecklistEntry[] }) {
  if (entries.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 py-1 text-[13px]">
      {entries.map((entry, i) => (
        <li key={i} data-state={entry.state} className={`flex items-start gap-2 ${entry.state === 'checked' ? 'opacity-70' : ''}`}>
          <ReadOnlyCheck state={entry.state} />
          <span className={`min-w-0 flex-1 break-words ${entry.state === 'checked' ? 'text-muted line-through' : 'text-fg'}`}>{entry.label}</span>
        </li>
      ))}
    </ul>
  )
}
