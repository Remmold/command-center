import type { SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import { STATUS_LABEL, isWaiting, needsYouQueue } from '../../shared/needsYou'

export const APP_TITLE = 'Command Center'
const TOOLTIP_LIMIT = 127

type NamedPath = Pick<Workspace, 'name' | 'path'>

export interface TrayBadge {
  count: number
  tooltip: string
}

function normalisePath(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
}

/** The workspace whose folder the session runs in. */
export function workspaceAt<W extends Pick<Workspace, 'path'>>(cwd: string, workspaces: readonly W[]): W | undefined {
  const key = normalisePath(cwd)
  return workspaces.find((w) => normalisePath(w.path) === key)
}

/** The workspace whose folder the session runs in, else the session's own folder name. */
export function workspaceNameFor(cwd: string, workspaces: readonly NamedPath[]): string {
  const match = workspaceAt(cwd, workspaces)
  if (match) return match.name
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
}

export function trayBadge(entries: readonly SessionStatusEntry[], workspaces: readonly NamedPath[]): TrayBadge {
  const queue = needsYouQueue(entries)
  if (queue.length === 0) return { count: 0, tooltip: APP_TITLE }
  const names = [...new Set(queue.map((e) => workspaceNameFor(e.cwd, workspaces)))]
  const head = `${APP_TITLE}: ${queue.length} waiting\n`
  return { count: queue.length, tooltip: head + fitNames(names, TOOLTIP_LIMIT - head.length) }
}

function fitNames(names: string[], room: number): string {
  const all = names.join(', ')
  if (all.length <= room) return all
  for (let shown = names.length - 1; shown >= 0; shown--) {
    const more = `+${names.length - shown} more`
    const text = [...names.slice(0, shown), more].join(', ')
    if (text.length <= room) return text
  }
  return `+${names.length} more`.slice(0, room)
}

export interface Onscreen {
  paneId: string | null
  /** The window is shown, not minimised, and has focus. */
  windowShowing: boolean
}

export function shouldNotify(
  previous: SessionStatus | undefined,
  next: SessionStatusEntry,
  onscreen: Onscreen
): boolean {
  if (!isWaiting(next) || previous === next.status) return false
  return !(onscreen.windowShowing && onscreen.paneId === next.paneId)
}

export function notificationText(
  entry: SessionStatusEntry,
  workspaces: readonly NamedPath[]
): { title: string; body: string } {
  return { title: workspaceNameFor(entry.cwd, workspaces), body: STATUS_LABEL[entry.status] }
}

/** A click on a waiting chat's notification opens the approval inbox at its request when it waits on one, else the chat. */
export function clickTarget(entry: SessionStatusEntry): 'approvals' | 'chat' {
  return entry.status === 'needs-approval' ? 'approvals' : 'chat'
}
