import { useEffect, useRef, useState } from 'react'
import { bindingLabel, keystrokeText } from '../../../shared/keybindings'
import { Button } from './Button'

interface Props {
  label: string
  /** Why the keys can't be used, or null. */
  problem: (binding: string) => string | null
  /** A note on keys that can be used, such as what they run now. */
  note?: (binding: string) => string | null
  onCapture: (binding: string) => void
  onCancel: () => void
}

/** Past this many keystrokes a new press starts the chord over. */
const MAX_STROKES = 3

/**
 * Takes keys by being pressed: each keystroke joins the chord (`ctrl+k ctrl+s`), and Use takes it. Every key
 * goes to the box while it has focus, Escape and Tab included; the app's own shortcuts stand aside (`keyCaptureOpen`).
 */
export function KeyCaptureField({ label, problem, note, onCapture, onCancel }: Props) {
  const [strokes, setStrokes] = useState<string[]>([])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.focus(), [])
  const binding = strokes.join(' ')
  const why = binding ? problem(binding) : null
  const said = binding && !why ? (note?.(binding) ?? null) : null
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
      <div
        ref={box}
        tabIndex={0}
        role="textbox"
        aria-readonly
        aria-label={label}
        data-key-capture
        onKeyDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const stroke = keystrokeText(e)
          if (stroke) setStrokes((now) => (now.length >= MAX_STROKES ? [stroke] : [...now, stroke]))
        }}
        className="min-w-24 rounded border border-focus bg-input px-1.5 py-1 font-mono text-[11px] text-fg focus:outline-none"
      >
        {binding ? bindingLabel(binding) : <span className="text-faint">Press keys…</span>}
      </div>
      <Button disabled={!binding || why !== null} onClick={() => onCapture(binding)}>
        Use
      </Button>
      <Button
        variant="secondary"
        disabled={!binding}
        onClick={() => {
          setStrokes([])
          box.current?.focus()
        }}
      >
        Again
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {why && (
        <p role="alert" className="w-full text-right text-[11px] text-warning">
          {why}: pick another key.
        </p>
      )}
      {said && <p className="w-full text-right text-[11px] text-muted">{said}</p>}
    </div>
  )
}
