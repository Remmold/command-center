/** True while a dialog or popover is open, so board-wide keys leave Escape and arrows to it. */
export function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}
