import { app } from 'electron'
import type { StartWithWindowsState } from '../../shared/types'
import { loginItemSettings, startWithWindowsState } from './autostart'

/** The one place the login item is read and written, shared by the tray and Settings. */
export interface StartWithWindowsControl {
  get: () => StartWithWindowsState
  set: (checked: boolean) => StartWithWindowsState
  onChanged: (listener: (state: StartWithWindowsState) => void) => void
}

export function createStartWithWindowsControl(): StartWithWindowsControl {
  const listeners: Array<(state: StartWithWindowsState) => void> = []

  const get = (): StartWithWindowsState => {
    let launchesAtLogin = false
    if (app.isPackaged) {
      const current = app.getLoginItemSettings({ args: loginItemSettings(true).args })
      // openAtLogin stays true when the entry is switched off in Task Manager's Startup apps.
      launchesAtLogin = current.openAtLogin && current.executableWillLaunchAtLogin
    }
    return startWithWindowsState({ packaged: app.isPackaged, launchesAtLogin })
  }

  return {
    get,
    set: (checked) => {
      if (get().enabled) app.setLoginItemSettings(loginItemSettings(checked))
      const state = get()
      for (const listener of listeners) listener(state)
      return state
    },
    onChanged: (listener) => {
      listeners.push(listener)
    }
  }
}
