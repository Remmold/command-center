import type { ScreenFocus } from '../../shared/types'

let current: ScreenFocus = { paneId: null, windowVisible: false }

export function setScreenFocus(next: ScreenFocus): void {
  current = { paneId: next.paneId, windowVisible: next.windowVisible }
}

export function getScreenFocus(): ScreenFocus {
  return current
}
