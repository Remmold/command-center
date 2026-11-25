import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectView } from './projectViewsStore'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key)
})

const { useChatDrawerStore, initChatDrawer, DRAWER_MIN_WIDTH } = await import('./chatDrawer')
const { clampDrawerShare } = await import('../components/ui/drawerShare')
const { openInDrawer, useFocusRequestStore } = await import('./sessionNavigation')
const { useProjectViewsStore } = await import('./projectViewsStore')
const { useChatPairStore } = await import('./chatPairStore')

const DRAWER_KEY = 'command-center.chat-drawer'

function view(projectId: string, paneIds: string[]): ProjectView {
  return {
    projectId,
    projectName: projectId,
    projectPath: `C:/${projectId}`,
    claudeSessions: paneIds.map((id) => ({ id, title: id, thinking: false })),
    activeClaudeSessionId: paneIds[0] ?? null,
    shellTabs: [],
    activeShellTabId: null,
    openFiles: [],
    activeFilePath: null,
    openDiffs: [],
    activeDiffId: null,
    centerView: 'chat',
    idePanelsOpen: false,
    shellDrawerOpen: false
  }
}

const drawer = () => useChatDrawerStore.getState()

beforeEach(() => {
  useProjectViewsStore.setState({ views: { p1: view('p1', ['a', 'b']), p2: view('p2', ['c']) }, order: ['p1', 'p2'], activeProjectId: 'p1' })
  useChatPairStore.getState().setPair({ halves: [{ kind: 'hosted', paneId: 'a' }], focused: 0 })
  useChatDrawerStore.setState({ paneId: null })
  useFocusRequestStore.getState().clear()
})

describe('the chat drawer', () => {
  it('opens a hosted session, swaps to another, and closes', () => {
    expect(openInDrawer('c')).toBe(true)
    expect(drawer().paneId).toBe('c')
    openInDrawer('b')
    expect(drawer().paneId).toBe('b')
    drawer().close()
    expect(drawer().paneId).toBeNull()
  })

  it('does not open a session that is not hosted', () => {
    expect(openInDrawer('gone')).toBe(false)
    expect(drawer().paneId).toBeNull()
  })

  it("asks the session's chat to take focus", () => {
    openInDrawer('c')
    expect(useFocusRequestStore.getState().request?.paneId).toBe('c')
  })

  it("leaves Work's chat pair, active workspace and active session untouched", () => {
    const pair = useChatPairStore.getState().pair
    openInDrawer('c')
    expect(useChatPairStore.getState().pair).toBe(pair)
    expect(useProjectViewsStore.getState().activeProjectId).toBe('p1')
    expect(useProjectViewsStore.getState().views.p2?.activeClaudeSessionId).toBe('c')
    expect(useProjectViewsStore.getState().views.p1?.activeClaudeSessionId).toBe('a')
  })

  it('closes when its session no longer exists among the hosted sessions', () => {
    initChatDrawer()
    openInDrawer('c')
    useProjectViewsStore.setState({ views: { p1: view('p1', ['a', 'b']), p2: view('p2', []) } })
    expect(drawer().paneId).toBeNull()
  })

  it('stays open while its session is still hosted', () => {
    initChatDrawer()
    openInDrawer('c')
    useProjectViewsStore.setState({ views: { p1: view('p1', ['a']), p2: view('p2', ['c']) } })
    expect(drawer().paneId).toBe('c')
  })
})

describe('the chat drawer width', () => {
  it('starts at 0.4 of the Dashboard', () => {
    expect(drawer().share).toBe(0.4)
  })

  it('is kept between 420 px and 80 %', () => {
    expect(DRAWER_MIN_WIDTH).toBe(420)
    expect(clampDrawerShare(0.1, DRAWER_MIN_WIDTH, 1000)).toBe(0.42)
    expect(clampDrawerShare(0.95, DRAWER_MIN_WIDTH, 1000)).toBe(0.8)
    expect(clampDrawerShare(0.5, DRAWER_MIN_WIDTH, 1000)).toBe(0.5)
  })

  it('persists the share but not the session', () => {
    openInDrawer('c')
    drawer().setShare(0.55)
    const persisted = JSON.parse(saved.get(DRAWER_KEY) ?? '{}') as { state?: Record<string, unknown> }
    expect(persisted.state).toEqual({ share: 0.55 })
  })
})
