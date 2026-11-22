/** The extension's `d0`: within this many pixels of the bottom, new output is followed. */
export const FOLLOW_PX = 50

export interface ScrollBox {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export function isAtBottom(box: ScrollBox): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_PX
}

/**
 * Whether output is followed after a scroll event. Only a scroll up leaves the bottom on purpose: the
 * app's own scroll to the bottom can be reported after more output already arrived, which would
 * otherwise look like the reader having scrolled away.
 */
export function followsAfterScroll({ following, previousTop, box }: { following: boolean; previousTop: number; box: ScrollBox }): boolean {
  if (isAtBottom(box)) return true
  if (box.scrollTop < previousTop) return false
  return following
}
