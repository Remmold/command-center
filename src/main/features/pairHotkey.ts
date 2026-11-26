/** The key that flips focus between a test pair's two windows: F6, the browsers' "next pane" key, bare. */
export const PAIR_FLIP_KEY = 'F6'

export interface PairKeyInput {
  type: string
  key: string
  control: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export function isPairFlipKey(input: PairKeyInput): boolean {
  return input.type === 'keyDown' && input.key === PAIR_FLIP_KEY && !input.control && !input.alt && !input.shift && !input.meta
}
