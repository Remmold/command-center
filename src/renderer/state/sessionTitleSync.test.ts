import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectView } from './projectViewsStore'

const saved = new Map<string, string>()
const writes: string[] = []
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => {
    writes.push(key)
    saved.set(key, value)
  },
  removeItem: (key: string) => saved.delete(key)
})

const { useProjectViewsStore } = await import('./projectViewsStore')
const { noteClaudeSessionId } = await import('./sessionTitleSync')

const VIEWS_KEY = 'command-center.project-views'

function viewsWrites(): number {
  return writes.filter((key) => key === VIEWS_KEY).length
}

function storedSessionId(): string | undefined {
  const persisted = JSON.parse(saved.get(VIEWS_KEY) ?? '{}') as {
    state?: { views?: Record<string, { claudeSessions: { id: string; claudeSessionId?: string }[] }> }
  }
  return persisted.state?.views?.p1?.claudeSessions.find((c) => c.id === 'pane-1')?.claudeSessionId
}

beforeEach(() => {
  const view: ProjectView = {
    projectId: 'p1',
    projectName: 'Project',
    projectPath: 'C:/project',
    claudeSessions: [{ id: 'pane-1', title: 'A chat', thinking: false, claudeSessionId: 'cli-1' }],
    activeClaudeSessionId: 'pane-1',
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
  useProjectViewsStore.setState({ views: { p1: view } })
  writes.length = 0
})

describe('noting the Claude session id of a streamed event', () => {
  it('writes nothing to storage when the id is unchanged', () => {
    noteClaudeSessionId('pane-1', 'cli-1')
    noteClaudeSessionId('pane-1', 'cli-1')

    expect(viewsWrites()).toBe(0)
  })

  it('saves a changed id', () => {
    noteClaudeSessionId('pane-1', 'cli-2')

    expect(viewsWrites()).toBe(1)
    expect(storedSessionId()).toBe('cli-2')
  })
})
