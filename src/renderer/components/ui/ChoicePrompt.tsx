import { forwardRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { IconButton } from './IconButton'

interface PromptProps {
  label: string
  /** Left out when the body carries its own heading, as a question card does. */
  title?: ReactNode
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
      {title && <div className="text-[13px] text-fg">{title}</div>}
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

/** A bordered box for wide content, e.g. a diff, scrolling past its height. */
export function PromptBox({ children }: { children: ReactNode }) {
  return <div className="max-h-72 overflow-auto rounded border border-subtle bg-editor">{children}</div>
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
  disabled?: boolean
  onClick: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void
  children: ReactNode
}

const CHOICE_DISABLED = 'disabled:cursor-default disabled:opacity-50'
const CHOICE = 'flex w-full items-baseline gap-2 rounded px-2.5 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus'
const CHOICE_LOOK = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  normal: 'bg-input text-fg hover:bg-strong'
}

export const ChoiceButton = forwardRef<HTMLButtonElement, ChoiceProps>(function ChoiceButton(
  { shortcut, primary, disabled = false, onClick, onKeyDown, children },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`${CHOICE} ${CHOICE_DISABLED} ${CHOICE_LOOK[primary ? 'primary' : 'normal']}`}
    >
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

const OPTION_SELECTOR = '[role="radio"], [role="checkbox"]'

/** Where an approval prompt lives: a chat pane or the approval inbox; a new prompt takes focus only from inside its own. */
export const PROMPT_HOSTS = '[data-chat-pane], [data-approval-inbox]'

export function optionRows(root: HTMLElement | null): HTMLElement[] {
  return Array.from(root?.querySelectorAll<HTMLElement>(OPTION_SELECTOR) ?? [])
}

/** Focuses a prompt's first answer: the picked or first option of a question, else its first enabled choice. */
export function focusFirstAnswer(root: HTMLElement | null): void {
  const target = root?.querySelector<HTMLElement>('[aria-checked="true"]') ?? optionRows(root)[0] ?? root?.querySelector<HTMLElement>('button:not([disabled])')
  target?.focus()
}

/** True when a new prompt may take focus: nothing has it, or something in the prompt's own host does. */
export function mayTakeFocus(root: HTMLElement | null): boolean {
  const active = document.activeElement
  return !active || active === document.body || (root?.closest(PROMPT_HOSTS)?.contains(active) ?? false)
}

interface StepTab {
  label: string
  done: boolean
}

/** A row of steps over a card, e.g. one tab per question, with a close button at its end. */
export function StepTabs({ steps, current, onPick, onClose, closeLabel }: { steps: StepTab[]; current: number; onPick: (index: number) => void; onClose: () => void; closeLabel: string }) {
  return (
    <div role="tablist" className="flex min-w-0 items-center gap-1 border-b border-subtle pb-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {steps.map((step, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === current}
            onClick={() => onPick(i)}
            className={`inline-flex min-w-0 max-w-[12rem] items-center gap-1 rounded px-2 py-0.5 text-[11px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ${i === current ? 'bg-list-selected text-fg' : 'text-muted hover:bg-list-hover hover:text-fg'}`}
          >
            {step.done && <Check size={11} strokeWidth={2.5} className="shrink-0 text-success" aria-label="answered" />}
            <span className="truncate">{step.label}</span>
          </button>
        ))}
      </div>
      <IconButton onClick={onClose} label={closeLabel}>
        <X size={14} strokeWidth={2} />
      </IconButton>
    </div>
  )
}

export function PromptHeading({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-medium text-fg">{children}</div>
}

interface OptionRowProps {
  multiSelect: boolean
  label: string
  description?: string
  selected: boolean
  /** Faded beside a picked option in an answered, read-only card. */
  dimmed?: boolean
  /** Briefly marked after a pick, before the card moves on. */
  confirming?: boolean
  highlighted?: boolean
  describedBy?: string
  /** Left out for a read-only option. */
  onSelect?: () => void
  onHighlight?: () => void
  onHover?: () => void
  onHoverEnd?: () => void
  children?: ReactNode
}

/** One answer of a question: a radio or checkbox mark, its label and description. */
export function OptionRow({ multiSelect, label, description, selected, dimmed = false, confirming = false, highlighted = false, describedBy, onSelect, onHighlight, onHover, onHoverEnd, children }: OptionRowProps) {
  const readOnly = onSelect === undefined
  const look = confirming ? 'border-focus bg-list-selected' : highlighted ? 'border-strong bg-list-hover' : 'border-transparent'
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!onSelect || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    if (e.repeat) return
    // Enter on an option picks it; only on a picked one does it go on to submit.
    if (e.key === 'Enter' && !selected && !e.metaKey && !e.ctrlKey) e.stopPropagation()
    onSelect()
  }
  return (
    <div
      role={multiSelect ? 'checkbox' : 'radio'}
      aria-checked={selected}
      aria-disabled={readOnly || undefined}
      aria-describedby={describedBy}
      aria-label={label}
      tabIndex={readOnly ? undefined : 0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onFocus={onHighlight}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      className={`flex min-w-0 items-start gap-2 rounded border px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus ${look} ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-list-hover'} ${dimmed ? 'opacity-50' : ''}`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${multiSelect ? 'rounded-sm' : 'rounded-full'} ${selected ? 'border-accent bg-accent text-accent-fg' : 'border-strong bg-input'}`}
      >
        {selected && (multiSelect ? <Check size={10} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-fg">{label}</span>
        {description && <span className="break-words text-[11px] text-muted">{description}</span>}
        {children}
      </span>
    </div>
  )
}

/** A captioned box beside a list that shows what the highlighted entry stands for. */
export function PreviewPane({ id, caption, lines, children }: { id: string; caption: string; lines: number; children: ReactNode }) {
  const style = { minHeight: `calc(${lines} * 18px + 2rem)` } satisfies CSSProperties
  return (
    <div id={id} role="region" aria-label={`Preview: ${caption}`} tabIndex={-1} style={style} className="flex min-w-0 flex-col gap-1 rounded border border-subtle bg-editor p-2">
      <div aria-hidden className="truncate text-[11px] text-muted">{caption}</div>
      <div className="min-w-0 overflow-auto text-xs">{children}</div>
    </div>
  )
}

/** A list beside its preview: side by side when there is room, stacked when not. */
export function WithPreview({ list, preview }: { list: ReactNode; preview: ReactNode | null }) {
  if (!preview) return <>{list}</>
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <div className="min-w-[14rem] flex-1">{list}</div>
      <div className="min-w-[14rem] flex-1">{preview}</div>
    </div>
  )
}
