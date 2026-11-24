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

const UP_KEYS = new Set(['PageUp', 'ArrowUp', 'Home'])

/**
 * Whether the reader just asked to leave the bottom: a wheel or touchpad scroll up, or an up key in the
 * transcript. It is acted on at once, because new output re-pins the box to the bottom before the
 * resulting scroll event arrives, which otherwise snaps the reader straight back down.
 */
export function readerLeavesBottom(input: { kind: 'wheel'; deltaY: number } | { kind: 'key'; key: string }): boolean {
  return input.kind === 'wheel' ? input.deltaY < 0 : UP_KEYS.has(input.key)
}

/**
 * Whether output is followed after a scroll event. Only a scroll up leaves the bottom on purpose: the
 * app's own scroll to the bottom can be reported after more output already arrived, which would
 * otherwise look like the reader having scrolled away. `ownTop` is where the app last put the box
 * itself; lazily rendered messages can shrink the content, clamping that position lower before the
 * scroll event reports it, so landing exactly there is never the reader's doing.
 */
export function followsAfterScroll({
  following,
  previousTop,
  box,
  ownTop
}: {
  following: boolean
  previousTop: number
  box: ScrollBox
  ownTop?: number
}): boolean {
  if (isAtBottom(box)) return true
  if (ownTop !== undefined && box.scrollTop === ownTop) return following
  if (box.scrollTop < previousTop) return false
  return following
}
