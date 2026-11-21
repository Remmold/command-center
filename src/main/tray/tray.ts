import { Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import type { AppView } from '../../shared/types'
import { APP_TITLE, type TrayBadge } from '../attention/attention'
import { iconPath } from '../util/paths'

export interface TrayActions {
  open: () => void
  showView: (view: AppView) => void
  quit: () => void
  getWindow: () => BrowserWindow | null
}

export interface StartWithWindowsItem {
  checked: boolean
  enabled: boolean
  /** Shown in the label when the item is disabled, e.g. why autostart isn't offered. */
  reason?: string
  onToggle?: (checked: boolean) => void
}

export interface AppTray {
  setBadge: (badge: TrayBadge) => void
  /** Re-applies the taskbar overlay, which a re-shown window can drop. */
  refreshOverlay: () => void
  setStartWithWindows: (item: StartWithWindowsItem) => void
  destroy: () => void
}

const MAX_BADGE_NUMBER = 9

function badgeImage(prefix: 'tray' | 'overlay', count: number): NativeImage {
  const label = count > MAX_BADGE_NUMBER ? '9plus' : String(count)
  return nativeImage.createFromPath(iconPath(`${prefix}-${label}.png`))
}

export function createAppTray(actions: TrayActions): AppTray {
  const plain = nativeImage.createFromPath(iconPath('tray.png'))
  const tray = new Tray(plain)
  let startWithWindows: StartWithWindowsItem = {
    checked: false,
    enabled: false,
    reason: 'installed app only'
  }
  let badge: TrayBadge = { count: 0, tooltip: APP_TITLE }

  const rebuildMenu = () => {
    const autostart = startWithWindows
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open', click: actions.open },
        { label: 'Sessions', click: () => actions.showView('sessions') },
        { label: 'Board', click: () => actions.showView('board') },
        { type: 'separator' },
        {
          label:
            !autostart.enabled && autostart.reason
              ? `Start with Windows (${autostart.reason})`
              : 'Start with Windows',
          type: 'checkbox',
          checked: autostart.checked,
          enabled: autostart.enabled,
          click: (item) => autostart.onToggle?.(item.checked)
        },
        { type: 'separator' },
        { label: 'Quit', click: actions.quit }
      ])
    )
  }

  const applyOverlay = () => {
    const win = actions.getWindow()
    if (!win || process.platform !== 'win32') return
    if (badge.count === 0) win.setOverlayIcon(null, '')
    else win.setOverlayIcon(badgeImage('overlay', badge.count), `${badge.count} waiting`)
  }

  tray.setToolTip(badge.tooltip)
  tray.on('click', actions.open)
  rebuildMenu()

  return {
    setBadge: (next) => {
      badge = next
      tray.setImage(next.count > 0 ? badgeImage('tray', next.count) : plain)
      tray.setToolTip(next.tooltip)
      applyOverlay()
    },
    refreshOverlay: applyOverlay,
    setStartWithWindows: (item) => {
      startWithWindows = item
      rebuildMenu()
    },
    destroy: () => tray.destroy()
  }
}
