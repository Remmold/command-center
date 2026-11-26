import type { ReactNode } from 'react'

interface Props {
  label: string
  description?: string
  /** Small muted text under the label, e.g. the raw key the row edits. */
  hint?: string
  /** Muted lines under the description, e.g. the default. */
  notes?: ReactNode
  control: ReactNode
  /** Full-width content under the row, e.g. the entries of a list the field holds. */
  children?: ReactNode
}

/** One editable field of a form: label and explanation on the left, its control on the right, or under them when the row is too narrow for both. */
export function FormRow({ label, description, hint, notes, control, children }: Props) {
  return (
    <div role="group" aria-label={label} className="border-b border-subtle py-2.5 text-xs last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0 grow basis-48">
          <div className="text-fg">{label}</div>
          {hint && <div className="font-mono text-[10px] text-faint">{hint}</div>}
          {description && <p className="mt-0.5 text-muted">{description}</p>}
          {notes && <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">{notes}</div>}
        </div>
        <div className="ml-auto flex min-w-0 max-w-full shrink-0 basis-56 flex-wrap items-center justify-end gap-1">{control}</div>
      </div>
      {children && <div className="mt-1.5 pl-3">{children}</div>}
    </div>
  )
}
