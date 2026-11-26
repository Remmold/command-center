import { Check, X } from 'lucide-react'
import type { Mark, StepsView } from '../../../shared/testSteps'
import { MessageColumn } from '../chat/MessageColumn'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

type Found = Extract<StepsView, { found: true }>

interface Props {
  view: Found
  onMark: (hash: string, mark: Mark | null, note?: string) => void
}

/** A feature's test steps, each marked Pass or Fail with one click; a Fail takes a one-line note. */
export function TestStepsList({ view, onMark }: Props) {
  const { pass, fail, waiting } = view.counter
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <MessageColumn>
        <p role="status" className="mb-3 text-xs text-muted">
          {pass} pass · {fail} fail · {waiting} waiting
        </p>
        <ol className="flex flex-col gap-2">
          {view.steps.map((step, i) => (
            <li key={step.hash} aria-label={`Step ${i + 1}`} className="rounded border border-strong px-3 py-2">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1 break-words text-sm text-fg">{step.text}</span>
                <Button variant="secondary" pressed={step.mark === 'pass'} label={`Pass step ${i + 1}`} onClick={() => onMark(step.hash, step.mark === 'pass' ? null : 'pass')}>
                  <Check size={12} /> Pass
                </Button>
                <Button variant="secondary" pressed={step.mark === 'fail'} label={`Fail step ${i + 1}`} onClick={() => onMark(step.hash, step.mark === 'fail' ? null : 'fail', step.note)}>
                  <X size={12} /> Fail
                </Button>
              </div>
              {step.mark === 'fail' && (
                <div className="mt-2">
                  <TextField
                    key={step.note}
                    label={`Note for step ${i + 1}`}
                    placeholder="What went wrong (optional)"
                    initialValue={step.note}
                    submitOnBlur
                    keepOnSubmit
                    onSubmit={(note) => onMark(step.hash, 'fail', note)}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
        {view.problems.length > 0 && (
          <ul className="mt-3 text-xs text-muted">
            {view.problems.map((p) => (
              <li key={p.line}>
                Line {p.line} ignored: {p.reason}
              </li>
            ))}
          </ul>
        )}
      </MessageColumn>
    </div>
  )
}
