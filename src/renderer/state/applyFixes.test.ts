import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextReport } from '../../shared/context'
import type { DriftRunView, FindingsRun, ShownFinding } from '../../shared/findings'
import type { Workspace } from '../../shared/types'
import type { ProjectView } from './projectViewsStore'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key)
})

const reports = new Map<string, ContextReport>()
const report = vi.fn(async (id: string) => reports.get(id) ?? null)
vi.stubGlobal('window', { api: { context: { report } } })

/** Whether a new session's process starts and gets the prompt. */
let processStarts = true
const startSession = vi.fn((_workspace: Workspace, options: { send?: { delivered?: (reached: boolean) => void } }) => {
  options.send?.delivered?.(processStarts)
  return true
})
const sendToChat = vi.fn(async (..._args: unknown[]) => true)
vi.mock('./sessionNavigation', () => ({ startSession: (...args: Parameters<typeof startSession>) => startSession(...args) }))
vi.mock('./startRequests', async (actual) => ({ ...(await actual<typeof import('./startRequests')>()), sendToChat: (...args: unknown[]) => sendToChat(...args) }))

const { applyFixes } = await import('./applyFixes')
const { useProjectViewsStore } = await import('./projectViewsStore')
const { useWorkspacesStore } = await import('./workspacesStore')

const ACCOUNT = 'C:\\Users\\me\\.claude'
const RUNS = 'C:\\Users\\me\\AppData\\Roaming\\command-center\\drift-checks'

function workspace(id: string, path: string): Workspace {
  return { id, name: id, path, createdAt: 0, profileId: 'p', repoGroupKey: id, repoName: id, worktreeTag: '' }
}

const APP = workspace('app', 'C:\\projects\\app')
const LIB = workspace('lib', 'C:\\projects\\lib')
const GONE_PATH = 'C:\\projects\\gone'

function reportOf(path: string, memory: string): ContextReport {
  return {
    workspacePath: path,
    accountFolder: ACCOUNT,
    memoryFolder: `${ACCOUNT}\\projects\\${memory}\\memory`,
    folderExists: true,
    layers: { account: [], repo: [], local: [] } as unknown as ContextReport['layers'],
    startTotal: 0,
    missing: [],
    docs: []
  }
}

const APP_REPORT = reportOf(APP.path, 'C--projects-app')
const LIB_REPORT = reportOf(LIB.path, 'C--projects-lib')

function runView(runId: string, scope: FindingsRun['scope'], workspaces: string[], sessionId = `pane-${runId}`): DriftRunView {
  const run: FindingsRun = { version: 1, check: 'drift', scope, runId, sessionId, startedAt: '2026-11-25T10:00:00Z', accountFolder: ACCOUNT, workspaces, steps: [], findings: [], done: true }
  return { file: `${RUNS}\\${runId}.json`, run, writing: false, note: null, state: 'done', files: 'all', modified: {} }
}

const ticked = (id: string, runId: string, path = `${APP.path}\\CLAUDE.md`): ShownFinding => ({
  id,
  path,
  verdict: 'stale',
  severity: 'problem',
  claim: 'c',
  evidence: 'e',
  fix: 'f',
  status: 'open',
  runId
})

function hosting(paneIds: string[]): void {
  const view = { projectId: APP.id, claudeSessions: paneIds.map((id) => ({ id, title: id, thinking: false })) } as unknown as ProjectView
  useProjectViewsStore.setState({ views: { [APP.id]: view } })
}

function started(): { addDirs: string[]; prompt: string } {
  expect(startSession).toHaveBeenCalledTimes(1)
  const [ws, options] = startSession.mock.calls[0] as [Workspace, { addDirs: string[]; send: { prompt: string } }]
  expect(ws).toBe(APP)
  return { addDirs: options.addDirs, prompt: options.send.prompt }
}

beforeEach(() => {
  startSession.mockClear()
  sendToChat.mockClear()
  processStarts = true
  report.mockClear()
  reports.clear()
  reports.set(LIB.id, LIB_REPORT)
  useWorkspacesStore.setState({ workspaces: [APP, LIB] })
  hosting([])
})

describe('applyFixes', () => {
  it("sends the ticked message to the latest run's chat while that chat is still hosted", async () => {
    const run = runView('r1', 'project', [APP.path])
    hosting([run.run.sessionId])
    await expect(applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [run] }, ticked: [ticked('F1', 'r1')] })).resolves.toBeNull()
    expect(sendToChat).toHaveBeenCalledWith(run.run.sessionId, expect.stringContaining(`${run.file}\nIds: F1`))
    expect(startSession).not.toHaveBeenCalled()
  })

  it("starts a new session with the ticked message and the run's added folders once the run's chat is gone", async () => {
    const run = runView('r1', 'project', [APP.path])
    await expect(applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [run] }, ticked: [ticked('F1', 'r1')] })).resolves.toBeNull()
    expect(sendToChat).not.toHaveBeenCalled()
    const { addDirs, prompt } = started()
    expect(prompt).toContain(`Findings file: ${run.file}\nIds: F1`)
    expect(addDirs).toEqual([APP_REPORT.memoryFolder, RUNS])
  })

  it('gives the new session the folders of every run with a ticked finding, each once', async () => {
    const covering = runView('r1', 'cross-project', [APP.path, LIB.path])
    const account = runView('r2', 'account', [APP.path])
    await applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [covering, account] }, ticked: [ticked('F1', 'r1'), ticked('F2', 'r2', `${ACCOUNT}\\CLAUDE.md`)] })
    const { addDirs, prompt } = started()
    expect(prompt).toContain(`${covering.file}\nIds: F1`)
    expect(prompt).toContain(`${account.file}\nIds: F2`)
    expect(addDirs).toEqual([APP_REPORT.memoryFolder, LIB.path, LIB_REPORT.memoryFolder, ACCOUNT, RUNS])
  })

  it('skips a covered workspace that is no longer in the workspace list, keeping the rest', async () => {
    const run = runView('r1', 'cross-project', [APP.path, GONE_PATH, LIB.path])
    await expect(applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [run] }, ticked: [ticked('F1', 'r1')] })).resolves.toBeNull()
    const { addDirs } = started()
    expect(addDirs).toEqual([APP_REPORT.memoryFolder, LIB.path, LIB_REPORT.memoryFolder, ACCOUNT, RUNS])
    expect(addDirs.some((d) => d.startsWith(GONE_PATH))).toBe(false)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('reports an error when the new session cannot start', async () => {
    startSession.mockReturnValueOnce(false)
    const run = runView('r1', 'project', [APP.path])
    await expect(applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [run] }, ticked: [ticked('F1', 'r1')] })).resolves.toBe('Could not start a session for the fixes.')
  })

  it("reports an error when the run's chat cannot send the message to a running process", async () => {
    sendToChat.mockResolvedValueOnce(false)
    const run = runView('r1', 'project', [APP.path])
    hosting([run.run.sessionId])
    await expect(applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [run] }, ticked: [ticked('F1', 'r1')] })).resolves.toBe(
      "The run's chat could not send the fixes; its error shows in that chat in Work."
    )
    expect(startSession).not.toHaveBeenCalled()
  })

  it("reports an error when the new session's process fails to start", async () => {
    processStarts = false
    const run = runView('r1', 'project', [APP.path])
    await expect(applyFixes({ workspace: APP, report: APP_REPORT, drift: { runs: [run] }, ticked: [ticked('F1', 'r1')] })).resolves.toBe(
      "The fix session's process did not start; its error shows in that chat in Work."
    )
  })
})
