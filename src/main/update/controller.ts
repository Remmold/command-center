import type { RestartReply, UpdateStatus } from '../../shared/types'
import { busyPanes, reduceBusy, type BusyEvent, type BusyState } from './busyGate'
import { autoRestartAt, clickRestart, INITIAL_RESTART, reduceRestart, type RestartState } from './restartPlan'

/** What the controller needs from electron-updater; tests and the fake CLI pass a fake. */
export interface UpdaterPort {
  /** Resolves once the check is done; a found update downloads on its own and is reported by `onDownloaded`. */
  check(): Promise<void>
  onDownloaded(cb: (version: string) => void): void
  quitAndInstall(): void
}

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(fn: () => void, ms: number): unknown
}

export interface UpdateControllerOptions {
  updater: UpdaterPort
  clock: Clock
  version: string
  idleMs: number
  checkEveryMs: number
  /** This launch follows a restart to update. */
  afterUpdate?: boolean
  /** Restart by itself once idle; off leaves the install to a click or the next quit. */
  autoRestart: boolean
  /** Runs right before the app quits to install. */
  beforeRestart?: () => void
}

export interface UpdateController {
  start(): void
  feed(event: BusyEvent): void
  check(): Promise<void>
  /** A click on Restart to update; `force` is the answer to the busy question. */
  restart(force: boolean): RestartReply
  setAutoRestart(on: boolean): void
  status(): UpdateStatus
  onChange(cb: (status: UpdateStatus) => void): () => void
}

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const { updater, clock, idleMs } = options
  let busy: BusyState = {}
  let plan: RestartState = { ...INITIAL_RESTART, idleSince: clock.now() }
  let status: UpdateStatus = { version: options.version, lastCheck: null, checking: false, downloaded: null, error: null, afterUpdate: options.afterUpdate ?? false, autoRestart: options.autoRestart }
  let timer: unknown = null
  let listeners: ((s: UpdateStatus) => void)[] = []

  const publish = (next: Partial<UpdateStatus>): void => {
    status = { ...status, ...next }
    for (const cb of listeners) cb(status)
  }

  const install = (): void => {
    options.beforeRestart?.()
    updater.quitAndInstall()
  }

  const schedule = (): void => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
    if (!status.autoRestart) return
    const at = autoRestartAt(plan, idleMs)
    if (at === null) return
    timer = clock.setTimeout(() => {
      timer = null
      install()
    }, Math.max(0, at - clock.now()))
  }

  updater.onDownloaded((version) => {
    plan = reduceRestart(plan, { kind: 'downloaded', version, at: clock.now() })
    schedule()
    publish({ downloaded: version })
  })

  const check = async (): Promise<void> => {
    publish({ checking: true })
    try {
      await updater.check()
      publish({ checking: false, lastCheck: clock.now(), error: null })
    } catch (err) {
      publish({ checking: false, lastCheck: clock.now(), error: (err as Error).message })
    }
  }

  return {
    start() {
      void check()
      clock.setInterval(() => void check(), options.checkEveryMs)
    },
    feed(event) {
      const wasBusy = busyPanes(busy).length > 0
      busy = reduceBusy(busy, event)
      const isBusy = busyPanes(busy).length > 0
      if (wasBusy === isBusy) return
      plan = reduceRestart(plan, { kind: 'busy', busy: isBusy, at: clock.now() })
      schedule()
    },
    check,
    restart(force) {
      const decision = clickRestart(plan, force ? [] : busyPanes(busy))
      if (decision.kind === 'restart') install()
      return decision
    },
    setAutoRestart(on) {
      // Ticking the box must not restart at once over an update that has long been waiting: the idle timer starts now.
      if (on && plan.idleSince !== null) plan = { ...plan, idleSince: clock.now() }
      publish({ autoRestart: on })
      schedule()
    },
    status: () => status,
    onChange(cb) {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((c) => c !== cb)
      }
    }
  }
}
