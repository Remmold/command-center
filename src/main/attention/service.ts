import { Notification } from 'electron'
import { windowOffscreen } from '../testWindow'
import type { SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import type { SessionStatusTracker } from '../sessions/tracker'
import { notificationText, shouldNotify, trayBadge, type Onscreen, type TrayBadge } from './attention'

export interface AttentionDeps {
  tracker: SessionStatusTracker
  listWorkspaces: () => Promise<Workspace[]>
  onscreen: () => Onscreen
  setBadge: (badge: TrayBadge) => void
  openSession: (paneId: string) => void
  /** Path of the image to show for a session running in `cwd`. */
  notificationIcon: (cwd: string) => Promise<string>
}

const KEPT_NOTIFICATIONS = 20

export function startAttention(deps: AttentionDeps): () => void {
  const lastStatus = new Map<string, SessionStatus>()
  for (const e of deps.tracker.list()) lastStatus.set(e.paneId, e.status)
  // Electron drops click handlers of notifications that get garbage-collected, and on Windows a toast moved to the
  // Action Center can emit 'close' yet still be clicked later, so the most recent ones are kept alive.
  const live = new Set<Notification>()
  let badgeRun = 0

  const refreshBadge = async () => {
    const run = ++badgeRun
    const workspaces = await deps.listWorkspaces().catch(() => [])
    if (run === badgeRun) deps.setBadge(trayBadge(deps.tracker.list(), workspaces))
  }

  const notify = async (entry: SessionStatusEntry) => {
    if (!Notification.isSupported() || windowOffscreen(process.env)) return
    const workspaces = await deps.listWorkspaces().catch(() => [])
    const { title, body } = notificationText(entry, workspaces)
    const icon = await deps.notificationIcon(entry.cwd).catch(() => undefined)
    const n = new Notification({ title, body, icon })
    live.add(n)
    n.on('click', () => {
      live.delete(n)
      deps.openSession(entry.paneId)
    })
    if (live.size > KEPT_NOTIFICATIONS) live.delete(live.values().next().value as Notification)
    n.show()
  }

  const unsubscribe = deps.tracker.onChange((entry) => {
    const previous = lastStatus.get(entry.paneId)
    lastStatus.set(entry.paneId, entry.status)
    if (shouldNotify(previous, entry, deps.onscreen())) void notify(entry)
    void refreshBadge()
  })
  void refreshBadge()

  return () => {
    unsubscribe()
    for (const n of live) n.close()
    live.clear()
  }
}
