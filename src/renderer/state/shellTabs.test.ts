import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateTerminalRequest, TerminalInfo } from '../../shared/types'
import type { ProjectView } from './projectViewsStore'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key)
})

const created: CreateTerminalRequest[] = []
const closed: string[] = []
let pushChanged: (list: TerminalInfo[]) => void = () => undefined
let firstList: TerminalInfo[] = []
vi.stubGlobal('window', {
  api: {
    claude: { stop: () => undefined },
    terminals: {
      create: async (request: CreateTerminalRequest) => {
        created.push(request)
        return { ok: true }
      },
      close: (id: string) => void closed.push(id),
      list: async () => firstList,
      onChanged: (cb: (list: TerminalInfo[]) => void) => {
        pushChanged = cb
        return () => undefined
      }
    }
  }
})

const { useProjectViewsStore, initShellTabs, shellTabsOfSession } = await import('./projectViewsStore')
const { useTerminalsStore } = await import('./terminalsStore')

function view(projectId: string, shellTabs: string[] = []): ProjectView {
  return {
    projectId,
    projectName: projectId,
    projectPath: `C:/${projectId}`,
    claudeSessions: [{ id: `${projectId}-chat`, title: 'chat', thinking: false }],
    activeClaudeSessionId: `${projectId}-chat`,
    shellTabs,
    activeShellTabId: shellTabs.at(-1) ?? null,
    openFiles: [],
    activeFilePath: null,
    openDiffs: [],
    activeDiffId: null,
    centerView: 'chat',
    idePanelsOpen: false,
    shellDrawerOpen: shellTabs.length > 0
  }
}

const terminal = (id: string, workspaceId = 'p1'): TerminalInfo => ({
  id,
  workspaceId,
  cwd: `C:/${workspaceId}`,
  label: id,
  kind: 'pwsh',
  status: 'running',
  startedAt: 1
})

const store = () => useProjectViewsStore.getState()

beforeEach(() => {
  created.length = 0
  closed.length = 0
  useProjectViewsStore.setState({ views: { p1: view('p1'), p2: view('p2') }, order: ['p1', 'p2'], activeProjectId: 'p1' })
})

describe('the Shell drawer on the terminal pool', () => {
  it("starts a terminal in the workspace's folder with an account's environment and shows its id", () => {
    const id = store().openShell('p1', { kind: 'cmd', env: { CLAUDE_CONFIG_DIR: 'C:/p/work' } })
    expect(created).toEqual([{ id, workspaceId: 'p1', cwd: 'C:/p1', kind: 'cmd', env: { CLAUDE_CONFIG_DIR: 'C:/p/work' } }])
    expect(store().views.p1).toMatchObject({ shellTabs: [id], activeShellTabId: id, shellDrawerOpen: true })
  })

  it('closing a drawer tab removes it from that drawer only, and the terminal keeps running', () => {
    const id = store().openShell('p1')!
    store().closeShellTab('p1', id)
    expect(store().views.p1.shellTabs).toEqual([])
    expect(closed).toEqual([])
  })

  it("closing a project view doesn't end its terminals", () => {
    store().openShell('p1')
    store().closeProject('p1')
    expect(store().views.p1).toBeUndefined()
    expect(closed).toEqual([])
  })

  it('drops tabs whose terminal is not in the pool when it first loads, and ones closed later', async () => {
    useProjectViewsStore.setState({ views: { p1: view('p1', ['old', 'kept']), p2: view('p2', ['other']) } })
    const mine = store().openShell('p1')!
    firstList = [terminal('kept'), terminal('other', 'p2')]
    initShellTabs()
    useTerminalsStore.getState().init()
    await vi.waitFor(() => expect(useTerminalsStore.getState().loaded).toBe(true))
    expect(store().views.p1.shellTabs).toEqual(['kept', mine])

    pushChanged([terminal('kept'), terminal(mine)])
    expect(store().views.p2.shellTabs).toEqual([])
    expect(store().views.p1.shellTabs).toEqual(['kept', mine])
    expect(shellTabsOfSession('p1-chat').map((t) => t.label)).toEqual(['kept', mine])
  })
})
