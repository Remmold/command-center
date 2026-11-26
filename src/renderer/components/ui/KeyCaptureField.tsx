import { useEffect, useRef, useState } from 'react'
import { bindingLabel, keystrokeText } from '../../../shared/keybindings'
import { Button } from './Button'
import { captureKey, recordNext, startCapture, type CaptureState } from './keyCapture'

interface Props {
  label: string
  /** Why the keys can't be used, or null. */
  problem: (binding: string) => string | null
  /** A note on keys that can be used, such as what they run now. */
  note?: (binding: string) => string | null
  onCapture: (binding: string) => void
  onCancel: () => void
}

/**
 * Takes keys by being pressed, one keystroke per recording: opening, Enter or a click records the next one, so a chord
 * (`ctrl+k ctrl+s`) is built a keystroke at a time and Use takes it. While recording every key goes to the box, Escape
 * and Tab included, and the app's own shortcuts stand aside (`keyCaptureOpen`); between keystrokes Tab and Escape work.
 */
export function KeyCaptureField({ label, problem, note, onCapture, onCancel }: Props) {
  const [state, setState] = useState<CaptureState>(startCapture)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.focus(), [])
  const binding = state.strokes.join(' ')
  const why = binding ? problem(binding) : null
  const noted = binding && !why ? (note?.(binding) ?? null) : null
  const record = (next: CaptureState) => {
    setState(next)
    box.current?.focus()
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
      <div
        ref={box}
        tabIndex={0}
        role="textbox"
        aria-readonly
        aria-label={label}
        aria-description={state.recording ? 'Recording: the next key you press is taken' : 'Enter or a click records another key; Escape cancels'}
        data-key-capture={state.recording ? '' : undefined}
        data-recording={state.recording || undefined}
        onClick={() => !state.recording && record(recordNext(state))}
        onBlur={() => state.recording && setState({ ...state, recording: false })}
        onKeyDown={(e) => {
          const stroke = keystrokeText({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, altGraph: e.getModifierState('AltGraph') })
          const step = captureKey(state, { stroke, key: e.key, modified: e.ctrlKey || e.shiftKey || e.altKey || e.metaKey })
          if (step.kind === 'pass') return
          e.preventDefault()
          e.stopPropagation()
          if (step.kind === 'cancel') onCancel()
          else setState(step.next)
        }}
        className={`min-w-24 rounded border bg-input px-1.5 py-1 font-mono text-[11px] text-fg focus:outline-none ${state.recording ? 'border-focus' : 'border-subtle focus-visible:border-focus'}`}
      >
        {binding && bindingLabel(binding)}
        {state.recording ? <span className="text-faint">{binding ? ' then…' : 'Press keys…'}</span> : !binding && <span className="text-faint">Enter to record</span>}
      </div>
      <Button disabled={!binding || why !== null} onClick={() => onCapture(binding)}>
        Use
      </Button>
      <Button variant="secondary" disabled={!binding} onClick={() => record(startCapture())}>
        Again
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {binding && !state.recording && !why && <p className="w-full text-right text-[11px] text-muted">Enter or a click on the box adds the next key of a chord.</p>}
      {why && (
        <p role="alert" className="w-full text-right text-[11px] text-warning">
          {why}: pick another key.
        </p>
      )}
      {noted && <p className="w-full text-right text-[11px] text-muted">{noted}</p>}
    </div>
  )
}
