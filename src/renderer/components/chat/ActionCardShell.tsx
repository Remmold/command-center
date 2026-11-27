import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActionState } from '../../../shared/actionBlocks'
import { Button } from '../ui/Button'
import type { ActionRun } from './toolContext'

/** One part of a card. `verbatim` shows text exactly as it will be used, in the code look, set off like a quote. */
export function CardField({ label, children, error = false, verbatim = false }: { label: string; children: string; error?: boolean; verbatim?: boolean }) {
  const look = verbatim ? 'border-l-[3px] border-strong pl-3 font-mono text-[12px] leading-[18px]' : ''
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd data-action-field={label.toLowerCase()} className={`whitespace-pre-wrap break-words ${look} ${error ? 'text-error' : 'text-fg'}`}>
        {children}
      </dd>
    </div>
  )
}

export interface ActionCardShellProps {
  /** The block's tag. */
  tag: string
  /** The kind as the header names it, e.g. "Feature proposal". */
  title: string
  /** What the card is about, for its accessible name. */
  subject: string
  state: ActionState
  /** The header note once the action happened, e.g. "Started". */
  doneNote: string
  /** The block's parts, as the card shows them. */
  children: ReactNode
  /**
   * Asked before the button enables, on a live card, again whenever `preflightKey` changes: why the action would fail,
   * or null. Null itself means the card cannot be checked yet (its body says why) and the button stays off.
   */
  preflight: (() => Promise<string | null>) | null
  preflightKey: string
  /** Shown under a preflight problem, e.g. what to ask the chat for. */
  problemHint?: string
  button: string
  /** The button's label while the action runs. */
  running: string
  run: () => ActionRun
  /** The heading above an error the action resolved with. */
  failed: string
  /** A second action a done card offers, such as opening the session it started. */
  doneAction?: { label: string; run: () => Promise<string | null> }
}

const PENDING_NOTE: Partial<Record<ActionState, string>> = { waiting: 'The chat is still answering.', superseded: 'Superseded' }

/** Every action card's frame: the kind, its parts, the preflight before the button enables, and one inline error line. */
export function ActionCardShell(props: ActionCardShellProps) {
  const { tag, title, subject, state, doneNote, children, preflight, preflightKey, problemHint, button, running, run, failed, doneAction } = props
  const note = state === 'done' ? doneNote : PENDING_NOTE[state]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ heading: string | null; text: string } | null>(null)
  // undefined: asking; null: nothing in the way; text: why the action would fail.
  const [problem, setProblem] = useState<string | null | undefined>(undefined)
  const ask = useRef(preflight)
  ask.current = preflight
  const checkable = preflight !== null
  useEffect(() => {
    if (state !== 'live' || !checkable || busy) return
    let current = true
    setProblem(undefined)
    ask.current?.().then(
      (found) => current && setProblem(found),
      () => current && setProblem('The card could not be checked.')
    )
    return () => {
      current = false
    }
  }, [state, checkable, preflightKey, busy])
  const press = async () => {
    setBusy(true)
    setError(null)
    const outcome = await run()
    setBusy(false)
    if (outcome) setError({ heading: failed, text: outcome })
  }
  const second = async () => {
    const why = await doneAction?.run()
    setError(why ? { heading: null, text: why } : null)
  }
  return (
    <section data-action-card={tag} data-action-state={state} aria-label={`${title} ${subject}`} className="my-2 rounded-md border border-strong bg-sidebar px-3 py-2 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium text-fg">{title}</span>
        {note && (
          <span data-action-note="" className="text-muted">
            {note}
          </span>
        )}
      </div>
      <dl className="flex flex-col gap-2">{children}</dl>
      {error && (
        <div data-action-error="" role="alert" className="mt-2 text-error">
          {error.heading && <p className="font-medium">{error.heading}</p>}
          <p className="whitespace-pre-wrap break-words">{error.text}</p>
        </div>
      )}
      {state === 'live' && typeof problem === 'string' && !busy && (
        <div data-action-problem="" role="alert" className="mt-2 text-error">
          <p>{problem}</p>
          {problemHint && <p>{problemHint}</p>}
        </div>
      )}
      {state === 'live' && (
        <div className="mt-2 flex justify-end">
          <Button onClick={() => void press()} disabled={busy || !checkable || problem !== null}>
            {busy ? running : button}
          </Button>
        </div>
      )}
      {state === 'done' && doneAction && (
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={() => void second()}>
            {doneAction.label}
          </Button>
        </div>
      )}
    </section>
  )
}
