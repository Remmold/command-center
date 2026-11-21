import type { DiscoveryModel, Workspace } from '../../shared/types'
import { getCommonDir } from '../git/service'
import { discoverRepos } from './discovery'
import { nodeFileReader } from './nodeFileReader'
import { readScanRoots, writeScanRoots } from './scanRoots'

const RESCAN_MS = 5 * 60 * 1000

export class DiscoveryService {
  private model: DiscoveryModel = { scanRoots: [], repos: [], scannedAt: null, scanMs: null }
  private running: Promise<DiscoveryModel> | null = null
  private again = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly listWorkspaces: () => Promise<Workspace[]>,
    private readonly push: (model: DiscoveryModel) => void
  ) {}

  start(): void {
    void this.rescan()
    this.timer = setInterval(() => void this.rescan(), RESCAN_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  current(): DiscoveryModel {
    return this.model
  }

  /** A call during a scan runs one more scan after it, so a workspace added mid-scan is never offered again. */
  rescan(): Promise<DiscoveryModel> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.scanUntilSettled().finally(() => {
      this.running = null
    })
    return this.running
  }

  async setRoots(roots: string[]): Promise<DiscoveryModel> {
    await writeScanRoots(roots)
    return this.rescan()
  }

  private async scanUntilSettled(): Promise<DiscoveryModel> {
    do {
      this.again = false
      await this.scanOnce()
    } while (this.again)
    return this.model
  }

  private async scanOnce(): Promise<void> {
    try {
      const started = Date.now()
      const scanRoots = await readScanRoots()
      const repos = await discoverRepos(scanRoots, await this.listWorkspaces(), {
        files: nodeFileReader,
        commonDirOf: getCommonDir
      })
      this.model = { scanRoots, repos, scannedAt: Date.now(), scanMs: Date.now() - started }
      this.push(this.model)
    } catch (err) {
      console.error('[board] discovery failed', err)
    }
  }
}
