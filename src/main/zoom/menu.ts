import type { MenuItem } from 'electron'
import { replaceMenuItems } from '../appMenu'
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
  replaceMenuItems((item) => {
    const zoom = zoomOf(item)
    return zoom ? { label: item.label, accelerator: zoom.accelerator, registerAccelerator: false, click: () => void stepZoom(zoom.step) } : null
  })
}
