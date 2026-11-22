import { Menu, MenuItem, type MenuItemConstructorOptions } from 'electron'
import type { ZoomStep } from '../../shared/zoom'
import { stepZoom } from './service'

const MENU_ZOOM: Record<string, { step: ZoomStep; accelerator: string }> = {
  zoomin: { step: 'in', accelerator: 'CmdOrCtrl+=' },
  zoomout: { step: 'out', accelerator: 'CmdOrCtrl+-' },
  resetzoom: { step: 'reset', accelerator: 'CmdOrCtrl+0' }
}

function zoomOf(item: MenuItem): (typeof MENU_ZOOM)[string] | undefined {
  return item.role ? MENU_ZOOM[item.role.toLowerCase()] : undefined
}

/**
 * Electron's default View menu zooms the page directly, around the saved level; its zoom items step it instead.
 * Their keys stay the renderer's, so the accelerators are only shown.
 */
export function routeMenuZoom(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const items = menu.items.map((top): MenuItem | MenuItemConstructorOptions => {
    const sub = top.submenu?.items
    if (!sub?.some((i) => zoomOf(i))) return top
    return {
      label: top.label,
      submenu: Menu.buildFromTemplate(
        sub.map((i) => {
          const zoom = zoomOf(i)
          return zoom ? { label: i.label, accelerator: zoom.accelerator, registerAccelerator: false, click: () => void stepZoom(zoom.step) } : i
        })
      )
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(items))
}
