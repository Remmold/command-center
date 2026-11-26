/** Past this many keystrokes a new one starts the chord over. */
export const MAX_STROKES = 3

export interface CaptureState {
  strokes: string[]
  /** The next keystroke, whatever it is, joins the chord; otherwise keys move focus and act as usual. */
  recording: boolean
}

export interface CaptureKey {
  /** The keystroke as binding text, or null for a lone modifier. */
  stroke: string | null
  key: string
  modified: boolean
}

export type CaptureStep = { kind: 'pass' } | { kind: 'cancel' } | { kind: 'take'; next: CaptureState }

export const startCapture = (): CaptureState => ({ strokes: [], recording: true })

export const recordNext = (state: CaptureState): CaptureState => ({ ...state, recording: true })

/**
 * Recording takes exactly one keystroke, Escape and Tab included, then stops, so no key can trap focus in the box.
 * When not recording, Enter records the next keystroke of a chord, Escape cancels, and every other key passes.
 */
export function captureKey(state: CaptureState, press: CaptureKey): CaptureStep {
  if (state.recording) {
    if (!press.stroke) return { kind: 'take', next: state }
    const strokes = state.strokes.length >= MAX_STROKES ? [press.stroke] : [...state.strokes, press.stroke]
    return { kind: 'take', next: { strokes, recording: false } }
  }
  if (press.modified) return { kind: 'pass' }
  if (press.key === 'Enter') return { kind: 'take', next: recordNext(state) }
  if (press.key === 'Escape') return { kind: 'cancel' }
  return { kind: 'pass' }
}
