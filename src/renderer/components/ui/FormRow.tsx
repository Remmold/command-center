import type { ReactNode } from 'react'

interface Props {
  label: string
  description: string
  /** Small muted text under the label, e.g. the raw key the row edits. */
  hint?: string
  /** Muted lines under the description, e.g. the default. */
  notes?: ReactNode
  control: ReactNode
}

/** One editable field of a form: label and explanation on the left, its control on the right. */
export function FormRow({ label, description, hint, notes, control }: Props) {
  return (
    <div role="group" aria-label={label} className="flex items-start justify-between gap-4 border-b border-subtle py-2.5 text-xs last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-fg">{label}</div>
        {hint && <div className="font-mono text-[10px] text-faint">{hint}</div>}
        <p className="mt-0.5 text-muted">{description}</p>
        {notes && <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">{notes}</div>}
      </div>
      <div className="flex w-56 shrink-0 justify-end">{control}</div>
    </div>
  )
}
