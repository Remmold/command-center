import { replaceMenuItems } from './appMenu'

/** Electron's default File → Exit quits at once; it goes through the quit confirm instead. */
export function routeMenuQuit(quit: () => void): void {
  replaceMenuItems((item) =>
    item.role?.toLowerCase() === 'quit' ? { label: item.label, accelerator: item.accelerator ?? undefined, click: quit } : null
  )
}
