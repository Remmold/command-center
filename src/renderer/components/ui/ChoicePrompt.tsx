import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface PromptProps {
  label: string
  title: ReactNode
  hint?: string
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}

/** A question card in the chat with numbered answers, answered by click or by its keys. */
export const ChoicePrompt = forwardRef<HTMLDivElement, PromptProps>(function ChoicePrompt(
  { label, title, hint, onKeyDown, children },
  ref
) {
  return (
    <div
      ref={ref}
      role="group"
      data-choice-prompt
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2 rounded-md border border-warning bg-widget p-3 focus:outline-none"
    >
      <div className="text-[13px] text-fg">{title}</div>
      {children}
      {hint && <div className="text-[11px] text-faint">{hint}</div>}
    </div>
  )
})

/** Monospaced input shown in full, e.g. a shell command. */
export function PromptCode({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border border-subtle bg-editor px-2.5 py-1.5 font-mono text-[12px] text-fg">
      {children}
    </pre>
  )
}

export function PromptPath({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>
}

export function PromptNote({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-muted">{children}</p>
}

/** A collapsed "Details" section. */
export function PromptDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] text-link hover:underline"
      >
        Details
        <ChevronDown size={12} strokeWidth={2} className={open ? 'rotate-180' : ''} />
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

export function ChoiceList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>
}

interface ChoiceProps {
  shortcut: string
  primary?: boolean
  onClick: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void
  children: ReactNode
}

const CHOICE = 'flex w-full items-baseline gap-2 rounded px-2.5 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'
const CHOICE_LOOK = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  normal: 'bg-input text-fg hover:bg-strong'
}

export const ChoiceButton = forwardRef<HTMLButtonElement, ChoiceProps>(function ChoiceButton(
  { shortcut, primary, onClick, onKeyDown, children },
  ref
) {
  return (
    <button ref={ref} type="button" onClick={onClick} onKeyDown={onKeyDown} className={`${CHOICE} ${CHOICE_LOOK[primary ? 'primary' : 'normal']}`}>
      <span className="shrink-0 font-mono text-[11px] opacity-70">{shortcut}</span>
      <span className="min-w-0 break-words">{children}</span>
    </button>
  )
})

/** A clickable word inside a choice, e.g. where a rule is saved. */
export function ChoiceLink({ tooltip, onClick, children }: { tooltip: string; onClick: () => void; children: ReactNode }) {
  return (
    <span
      title={tooltip}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="cursor-pointer underline decoration-dotted underline-offset-2"
    >
      {children}
    </span>
  )
}

interface FieldProps {
  placeholder: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

/** A free-text answer beside the numbered choices. */
export const ChoiceField = forwardRef<HTMLInputElement, FieldProps>(function ChoiceField(
  { placeholder, value, onChange, onKeyDown },
  ref
) {
  return (
    <input
      ref={ref}
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="w-full min-w-0 rounded border border-strong bg-input px-2.5 py-1.5 text-xs text-fg placeholder:text-faint focus:border-focus focus:outline-none"
    />
  )
})
