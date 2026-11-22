import { autoUpdater } from 'electron-updater'
import type { UpdaterPort } from './controller'

/** electron-updater on the GitHub provider from `electron-builder.yml`'s `publish`. */
export function githubUpdater(): UpdaterPort {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (err) => console.error('[update]', err))
  return {
    async check() {
      await autoUpdater.checkForUpdates()
    },
    onDownloaded(cb) {
      autoUpdater.on('update-downloaded', (info) => cb(info.version))
    },
    quitAndInstall() {
      autoUpdater.quitAndInstall(true, true)
    }
  }
}

/** Never contacts GitHub. The e2e suite reaches it as `globalThis.__ccFakeUpdater` through `app.evaluate`. */
export class FakeUpdater implements UpdaterPort {
  checks = 0
  restartRequests = 0
  private downloaded: ((version: string) => void)[] = []

  async check(): Promise<void> {
    this.checks++
  }

  onDownloaded(cb: (version: string) => void): void {
    this.downloaded.push(cb)
  }

  deliver(version: string): void {
    for (const cb of this.downloaded) cb(version)
  }

  quitAndInstall(): void {
    this.restartRequests++
    console.log('[update] fake updater: restart to install requested')
  }
}
