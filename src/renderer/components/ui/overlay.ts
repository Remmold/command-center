/** True while a dialog or popover is open, so board-wide keys leave Escape and arrows to it. */
export function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null
}

export function isTyping(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** A key capture box has focus, so every key is the one being set, not an app shortcut. */
export function keyCaptureOpen(): boolean {
  return document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute('data-key-capture')
}
