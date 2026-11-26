import { Menu, MenuItem, type MenuItemConstructorOptions } from 'electron'

/** Rebuilds the application menu with each submenu item `replace` returns a replacement for; null keeps the item. */
export function replaceMenuItems(replace: (item: MenuItem) => MenuItemConstructorOptions | null): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const items = menu.items.map((top): MenuItem | MenuItemConstructorOptions => {
    const sub = top.submenu?.items.map((i) => ({ item: i, replacement: replace(i) }))
    if (!sub?.some((s) => s.replacement)) return top
    return { label: top.label, submenu: Menu.buildFromTemplate(sub.map((s) => s.replacement ?? s.item)) }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(items))
}
