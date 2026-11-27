import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JustStarted, MainChatInfo } from '../../shared/mainChat'
import type { ProjectView } from './projectViewsStore'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
  removeItem: (key: string) => saved.delete(key)
})

const DIGEST = 'C:/data/feature-digest/feature-digest.md'
const reset = vi.fn(
  async (justStarted?: JustStarted): Promise<MainChatInfo> => ({ workspaceId: 'mc', path: 'C:/data/main-chat', profileId: 'default', digestFile: DIGEST, ...(justStarted ? { justStarted } : {}) })
)
vi.stubGlobal('window', { api: { mainChat: { reset } } })

const { useProjectViewsStore } = await import('./projectViewsStore')
const { useFreshStartStore } = await import('./freshStartStore')
const { resetMainChat, useMainChatStore } = await import('./mainChatStore')
const { useDoneActionsStore } = await import('./doneActionsStore')
const { goOutcome, settleOutcome } = await import('./proposalGo')
const { startOutcomeMessage } = await import('../../shared/features')

function view(sessions: ProjectView['claudeSessions']): ProjectView {
  return {
    projectId: 'mc',
    projectName: 'Main chat',
    projectPath: 'C:/data/main-chat',
    claudeSessions: sessions,
    activeClaudeSessionId: sessions[0]?.id ?? null,
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

const mainChat = () => useProjectViewsStore.getState().views.mc?.claudeSessions.find((c) => c.id === 'main-chat')

beforeEach(() => {
  reset.mockClear()
  useFreshStartStore.setState({ pending: {} })
  useMainChatStore.setState({ info: { workspaceId: 'mc', path: 'C:/data/main-chat', profileId: 'default', digestFile: DIGEST, claudeSessionId: 'old-session' } })
  useProjectViewsStore.setState({ views: { mc: view([{ id: 'main-chat', title: 'Planning the footer', titleFromClaude: true, thinking: true, claudeSessionId: 'old-session' }]) } })
})

describe('after a Go that ran', () => {
  it('a started feature resets the main chat with the feature named, and tells the old chat nothing', () => {
    const deps = { reset: vi.fn(), tell: vi.fn() }
    settleOutcome(goOutcome({ name: 'hello-footer', workspace: 'Test' }, null), deps)
    expect(deps.reset).toHaveBeenCalledWith({ name: 'hello-footer', workspace: 'Test' })
    expect(deps.tell).not.toHaveBeenCalled()
  })

  it('a failed start keeps the conversation and reports the failure to it', () => {
    const deps = { reset: vi.fn(), tell: vi.fn() }
    settleOutcome(goOutcome({ name: 'hello-footer', workspace: 'Test' }, 'The branch exists.'), deps)
    expect(deps.reset).not.toHaveBeenCalled()
    expect(deps.tell).toHaveBeenCalledWith(startOutcomeMessage('hello-footer', 'The branch exists.'))
    expect(deps.tell.mock.calls[0][0]).toMatch(/^\[Command Center\] The feature hello-footer did not start\. The branch exists\./)
  })
})

describe('after an open-session card ran', () => {
  it('tells the chat nothing and keeps the conversation', () => {
    const deps = { reset: vi.fn(), tell: vi.fn() }
    settleOutcome({ kind: 'none' }, deps)
    expect(deps.reset).not.toHaveBeenCalled()
    expect(deps.tell).not.toHaveBeenCalled()
  })
})

describe('resetting the main chat', () => {
  it('asks the mounted chat to restart in place, and forgets the old session only once the chat prepares, after its process stopped', async () => {
    await resetMainChat({ name: 'hello-footer', workspace: 'Test' })
    const fresh = useFreshStartStore.getState().pending['main-chat']
    expect(fresh).toBeDefined()
    expect(reset).not.toHaveBeenCalled()
    const prompt = await fresh.prepare()
    expect(reset).toHaveBeenCalledWith({ name: 'hello-footer', workspace: 'Test' })
    expect(prompt).toMatch(/^You are the main chat of Command Center/)
    expect(prompt).toContain('Just started: the feature hello-footer in workspace Test')
    expect(prompt).toContain(DIGEST)
    expect(useMainChatStore.getState().info?.claudeSessionId).toBeUndefined()
    expect(useMainChatStore.getState().info?.justStarted).toEqual({ name: 'hello-footer', workspace: 'Test' })
  })

  it('forgets which cards were carried out, as the new conversation may reuse the old message ids', async () => {
    useDoneActionsStore.getState().remember('msg_1:0:0')
    await resetMainChat({ name: 'hello-footer', workspace: 'Test' })
    expect(useDoneActionsStore.getState().keys.has('msg_1:0:0')).toBe(true)
    await useFreshStartStore.getState().pending['main-chat'].prepare()
    expect(useDoneActionsStore.getState().keys.size).toBe(0)
  })

  it('Reset clears the session and names no feature', async () => {
    await resetMainChat()
    const prompt = await useFreshStartStore.getState().pending['main-chat'].prepare()
    expect(reset).toHaveBeenCalledWith(undefined)
    expect(prompt).not.toContain('Just started')
    expect(useMainChatStore.getState().info?.claudeSessionId).toBeUndefined()
  })

  it('a main chat not hosted is reset at once, so its next open starts fresh', async () => {
    useProjectViewsStore.setState({ views: {} })
    await resetMainChat()
    expect(reset).toHaveBeenCalledOnce()
    expect(useFreshStartStore.getState().pending).toEqual({})
  })

  it('the restarted pane drops its Claude id and its old title, keeping its place', () => {
    useProjectViewsStore.getState().startOver('main-chat')
    expect(mainChat()).toMatchObject({ id: 'main-chat', title: 'New session', claudeSessionId: undefined })
    expect(mainChat()?.titleFromClaude).toBeUndefined()
  })

  it('keeps a title the user gave the chat', () => {
    useProjectViewsStore.getState().renameSession('main-chat', 'Planning')
    useProjectViewsStore.getState().startOver('main-chat')
    expect(mainChat()).toMatchObject({ title: 'Planning', titleRenamed: true, claudeSessionId: undefined })
  })
})
