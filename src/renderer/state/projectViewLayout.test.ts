import { describe, expect, it } from 'vitest'
import type { ProjectView } from './projectViewsStore'
import {
  LAYOUT_VERSION,
  chatOnScreen,
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

describe('opening a shell on request', () => {
  it('adds a focused tab carrying the extra env and shows the shell drawer', () => {
    const opened = openShellTab(view('a'), { id: 't1', kind: 'pwsh', env: { CLAUDE_CONFIG_DIR: 'C:/p/work' } })
    expect(opened.shellTabs).toEqual([
      { id: 't1', label: 'pwsh', kind: 'pwsh', env: { CLAUDE_CONFIG_DIR: 'C:/p/work' } }
    ])
    expect(opened.activeShellTabId).toBe('t1')
    expect(opened.shellDrawerOpen).toBe(true)
  })

  it('numbers a second shell of the same kind', () => {
    const twice = openShellTab(openShellTab(view('a'), { id: 't1', kind: 'pwsh' }), { id: 't2', kind: 'pwsh' })
    expect(twice.shellTabs.map((t) => t.label)).toEqual(['pwsh', 'pwsh 2'])
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
