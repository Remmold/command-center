import { describe, expect, it } from 'vitest'
import { captureKey, startCapture, type CaptureKey, type CaptureState } from './keyCapture'

const press = (key: string, stroke: string | null = key.toLowerCase(), modified = false): CaptureKey => ({ key, stroke, modified })

/** Runs the presses through the box, returning where it ended and what each press did. */
function run(presses: CaptureKey[], from: CaptureState = startCapture()) {
  let state = from
  const kinds: string[] = []
  for (const p of presses) {
    const step = captureKey(state, p)
    kinds.push(step.kind)
    if (step.kind === 'take') state = step.next
  }
  return { state, kinds }
}

describe('the key capture box', () => {
  it('takes Escape and Tab as keys while recording, then lets Tab move focus and Escape cancel', () => {
    expect(run([press('Escape')]).state).toEqual({ strokes: ['escape'], recording: false })
    expect(run([press('Tab'), press('Tab')]).kinds).toEqual(['take', 'pass'])
    expect(run([press('Tab'), press('Escape')]).kinds).toEqual(['take', 'cancel'])
  })

  it('never keeps a keyboard user in: after any one keystroke, Tab passes', () => {
    for (const key of ['Escape', 'Tab', 'Enter', 'a', 'F5']) expect(run([press(key), press('Tab')]).kinds[1]).toBe('pass')
    expect(run([press('Tab', 'shift+tab', true), press('Tab', 'shift+tab', true)]).kinds[1]).toBe('pass')
  })

  it('builds a chord a keystroke at a time, Enter recording the next one', () => {
    const { state, kinds } = run([press('k', 'ctrl+k', true), press('Enter'), press('Enter')])
    expect(kinds).toEqual(['take', 'take', 'take'])
    expect(state).toEqual({ strokes: ['ctrl+k', 'enter'], recording: false })
  })

  it('waits through a lone modifier while recording', () => {
    expect(run([press('Control', null, true)]).state).toEqual({ strokes: [], recording: true })
  })

  it('starts the chord over past three keystrokes', () => {
    const { state } = run([press('a'), press('Enter'), press('b'), press('Enter'), press('c'), press('Enter'), press('d')])
    expect(state.strokes).toEqual(['d'])
  })
})
