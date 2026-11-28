import { describe, expect, it } from 'vitest'
import type { ProjectView } from './projectViewsStore'
import {
  LAYOUT_VERSION,
  chatOnScreen,
  dropRetiredMainChat,
  dropShellTabs,
  migrateLayout,
  openShellTab,
  persistableView,
  toggleIdePanels
} from './projectViewLayout'

const view = (projectId: string): ProjectView => ({
  projectId,
  projectName: projectId,
  projectPath: `C:/ws/${projectId}`,
  claudeSessions: [],
  activeClaudeSessionId: null,
  shellTabs: [],
  activeShellTabId: null,
  openFiles: [{ path: 'a.ts', content: 'x', dirty: false }],
  activeFilePath: 'a.ts',
  openDiffs: [],
  activeDiffId: null,
  centerView: 'file',
  idePanelsOpen: false,
  shellDrawerOpen: false
})

const saveAndRestore = (views: Record<string, ProjectView>) => {
  const saved = JSON.parse(
    JSON.stringify({
      views: Object.fromEntries(Object.entries(views).map(([id, v]) => [id, persistableView(v)]))
    })
  )
  migrateLayout(saved, LAYOUT_VERSION)
  return saved.views as Record<string, ProjectView>
}

describe('IDE panels per workspace', () => {
  it('starts closed for a workspace saved before the toggle existed', () => {
    const saved = { views: { a: { projectId: 'a', bottomPanelOpen: true } } }
    migrateLayout(saved, 7)
    expect(saved.views.a).toEqual({ projectId: 'a', idePanelsOpen: false, shellDrawerOpen: false })
  })

  it('remembers the toggle for the one workspace it was flipped in', () => {
    const restored = saveAndRestore({ a: toggleIdePanels(view('a')), b: view('b') })
    expect(restored.a.idePanelsOpen).toBe(true)
    expect(restored.b.idePanelsOpen).toBe(false)
  })
})

describe('Shell drawer tabs', () => {
  it('shows a terminal as the focused tab and opens the drawer', () => {
    const opened = openShellTab(view('a'), 't1')
    expect(opened.shellTabs).toEqual(['t1'])
    expect(opened.activeShellTabId).toBe('t1')
    expect(opened.shellDrawerOpen).toBe(true)
    expect(openShellTab(opened, 't1').shellTabs).toEqual(['t1'])
  })

  it('drops a tab, focusing the last one left, and closes the drawer when none are left', () => {
    const two = openShellTab(openShellTab(view('a'), 't1'), 't2')
    const one = dropShellTabs(two, (id) => id === 't2')
    expect(one).toMatchObject({ shellTabs: ['t1'], activeShellTabId: 't1', shellDrawerOpen: true })
    expect(dropShellTabs(two, (id) => id === 't1')).toMatchObject({ shellTabs: ['t2'], activeShellTabId: 't2' })
    expect(dropShellTabs(one, () => true)).toMatchObject({ shellTabs: [], activeShellTabId: null, shellDrawerOpen: false })
    expect(dropShellTabs(one, () => false)).toBe(one)
  })

  it('forgets tabs saved as whole shells before terminals moved to main', () => {
    const saved = { views: { a: { shellTabs: [{ id: 't1', label: 'pwsh', kind: 'pwsh' }], activeShellTabId: 't1' } } }
    migrateLayout(saved, 12)
    expect(saved.views.a).toMatchObject({ shellTabs: [], activeShellTabId: null })
  })
})

describe('chat on screen', () => {
  it('is the chat whenever the IDE panels are closed, whatever editor tab was last picked', () => {
    expect(chatOnScreen(view('a'))).toBe(true)
  })

  it('follows the picked tab while the IDE panels are open', () => {
    const open = toggleIdePanels(view('a'))
    expect(chatOnScreen(open)).toBe(false)
    expect(chatOnScreen({ ...open, centerView: 'chat' })).toBe(true)
  })
})

describe('the retired main chat', () => {
  it("drops the view that held the main chat's pane, from the views, the order and the active project", () => {
    const mainChat = { ...view('mc'), claudeSessions: [{ id: 'main-chat', title: 'Main chat' }] }
    const kept = { ...view('app'), claudeSessions: [{ id: 'pane-1', title: 'Fix the login' }] }
    const saved = { views: { mc: mainChat, app: kept }, order: ['app', 'mc'], activeProjectId: 'mc' as string | null }
    dropRetiredMainChat(saved)
    expect(saved).toEqual({ views: { app: kept }, order: ['app'], activeProjectId: null })
  })

  it('leaves the views alone when no main chat was saved', () => {
    const saved = { views: { app: view('app') }, order: ['app'], activeProjectId: 'app' }
    dropRetiredMainChat(saved)
    expect(saved).toEqual({ views: { app: view('app') }, order: ['app'], activeProjectId: 'app' })
  })
})
