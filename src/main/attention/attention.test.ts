import { describe, expect, it } from 'vitest'
import type { SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'
import { notificationText, shouldNotify, trayBadge } from './attention'

const entry = (paneId: string, status: SessionStatus): SessionStatusEntry => ({
  paneId,
  cwd: 'C:\\projects\\alpha',
  status,
  since: 1000
})

const hidden = { paneId: 'p1', windowShowing: false }

describe('notify or not', () => {
  it('notifies on entry into Needs approval or Your turn while the window is hidden', () => {
    expect(shouldNotify('running', entry('p1', 'needs-approval'), hidden)).toBe(true)
    expect(shouldNotify('running', entry('p1', 'your-turn'), hidden)).toBe(true)
    expect(shouldNotify('needs-approval', entry('p1', 'your-turn'), hidden)).toBe(true)
  })

  it('stays quiet for Running and Idle', () => {
    expect(shouldNotify('your-turn', entry('p1', 'running'), hidden)).toBe(false)
    expect(shouldNotify('running', entry('p1', 'idle'), hidden)).toBe(false)
    expect(shouldNotify(undefined, entry('p1', 'idle'), hidden)).toBe(false)
  })

  it('stays quiet when the status did not change', () => {
    expect(shouldNotify('your-turn', entry('p1', 'your-turn'), hidden)).toBe(false)
  })

  it('skips the session on screen in a showing window, but not other sessions', () => {
    const showingP1 = { paneId: 'p1', windowShowing: true }
    expect(shouldNotify('running', entry('p1', 'your-turn'), showingP1)).toBe(false)
    expect(shouldNotify('running', entry('p2', 'your-turn'), showingP1)).toBe(true)
    expect(shouldNotify('running', entry('p1', 'your-turn'), { paneId: null, windowShowing: true })).toBe(true)
  })
})

const ws = (name: string, path: string): Pick<Workspace, 'name' | 'path'> => ({ name, path })
const waiting = (paneId: string, cwd: string, status: SessionStatus, since: number): SessionStatusEntry => ({
  paneId,
  cwd,
  status,
  since
})

describe('tray badge', () => {
  const workspaces = [ws('alpha', 'C:\\projects\\alpha'), ws('beta-shard-2', 'C:\\projects\\beta-shard-2')]

  it('with nothing waiting shows no count and the plain app name', () => {
    expect(trayBadge([waiting('p1', 'C:\\projects\\alpha', 'running', 1)], workspaces)).toEqual({
      count: 0,
      tooltip: 'Command Center'
    })
  })

  it('counts Needs approval and Your turn and names the waiting workspaces, longest wait first', () => {
    expect(
      trayBadge(
        [
          waiting('p1', 'C:\\projects\\alpha', 'your-turn', 300),
          waiting('p2', 'c:/projects/beta-shard-2/', 'needs-approval', 100),
          waiting('p3', 'C:\\projects\\alpha', 'idle', 50),
          waiting('p4', 'C:\\projects\\alpha', 'running', 50)
        ],
        workspaces
      )
    ).toEqual({ count: 2, tooltip: 'Command Center: 2 waiting\nbeta-shard-2, alpha' })
  })

  it('names a workspace once when two of its sessions wait', () => {
    expect(
      trayBadge(
        [
          waiting('p1', 'C:\\projects\\alpha', 'your-turn', 1),
          waiting('p2', 'C:\\projects\\alpha', 'needs-approval', 2)
        ],
        workspaces
      ).tooltip
    ).toBe('Command Center: 2 waiting\nalpha')
  })

  it('falls back to the folder name for a session outside every workspace', () => {
    expect(trayBadge([waiting('p1', 'D:\\scratch\\tool', 'your-turn', 1)], workspaces).tooltip).toBe(
      'Command Center: 1 waiting\ntool'
    )
  })

  it('keeps the tooltip within the Windows limit of 127 characters', () => {
    const many = Array.from({ length: 12 }, (_, i) => ws(`workspace-number-${i}`, `C:\\w\\${i}`))
    const entries = many.map((w, i) => waiting(`p${i}`, w.path, 'your-turn', i))
    const { count, tooltip } = trayBadge(entries, many)
    expect(count).toBe(12)
    expect(tooltip.length).toBeLessThanOrEqual(127)
    expect(tooltip.startsWith('Command Center: 12 waiting\nworkspace-number-0, ')).toBe(true)
    expect(tooltip).toMatch(/, \+\d+ more$/)
  })
})

describe('notification text', () => {
  it('names the workspace and the status it entered', () => {
    const workspaces = [ws('alpha', 'C:/projects/alpha')]
    expect(notificationText(waiting('p1', 'C:/projects/alpha', 'needs-approval', 1), workspaces)).toEqual({
      title: 'alpha',
      body: 'Needs approval'
    })
    expect(notificationText(waiting('p1', 'C:/projects/alpha', 'your-turn', 1), workspaces)).toEqual({
      title: 'alpha',
      body: 'Your turn'
    })
  })
})
