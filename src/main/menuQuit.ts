import { Menu, MenuItem, type MenuItemConstructorOptions } from 'electron'

/** Electron's default File → Exit quits at once; it goes through the quit confirm instead. */
export function routeMenuQuit(quit: () => void): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const isQuit = (item: MenuItem): boolean => item.role?.toLowerCase() === 'quit'
  const items = menu.items.map((top): MenuItem | MenuItemConstructorOptions => {
    const sub = top.submenu?.items
    if (!sub?.some(isQuit)) return top
    return {
      label: top.label,
      submenu: Menu.buildFromTemplate(
        sub.map((i) => (isQuit(i) ? { label: i.label, accelerator: i.accelerator ?? undefined, click: quit } : i))
      )
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(items))
}
