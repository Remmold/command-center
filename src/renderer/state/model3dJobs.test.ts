import { describe, expect, it } from 'vitest'
import type { Model3dJob, Model3dRequest, Model3dStatus, Model3dView } from '../../shared/model3d'
import { jobDuration, model3dJobRows, type Model3dRowsInput } from './model3dJobs'

const req = (id: string, over: Partial<Model3dRequest> = {}): Model3dRequest => ({
  id,
  kind: 'generate',
  argv: ['--image', 'axe.png'],
  cwd: 'C:\\src\\game',
  python: 'python',
  script: 'gen3d.py',
  waiterPid: 1,
  wait: true,
  sessionId: '',
  configDir: '',
  submittedAt: '2026-11-28T10:00:00.000Z',
  summary: 'axe.png · prop',
  runAnyway: false,
  ...over
})

const status = (over: Partial<Model3dStatus> = {}): Model3dStatus => ({
  state: 'queued',
  waitReason: null,
  progress: null,
  startedAt: null,
  endedAt: null,
  error: null,
  outputs: [],
  ...over
})

const view = (...jobs: Model3dJob[]): Model3dView => ({ server: 'ready', startedByApp: true, jobs })

const INPUT: Omit<Model3dRowsInput, 'view'> = {
  sessions: [{ paneId: 'pane-1', title: 'Make the axe' }],
  workspaces: [
    { name: 'src', path: 'C:/src' },
    { name: 'game', path: 'C:/src/game' }
  ],
  profiles: [
    { id: 'default', name: 'Personal', configDir: 'C:\\Users\\me\\.claude' },
    { id: 'work', name: 'Work', configDir: 'C:\\Users\\me\\.claude-work' }
  ]
}

describe('3D view job rows', () => {
  it('lists newest first, by submittedAt', () => {
    const rows = model3dJobRows({
      ...INPUT,
      view: view(
        { request: req('old', { submittedAt: '2026-11-28T09:00:00.000Z' }), status: status() },
        { request: req('new', { submittedAt: '2026-11-28T11:00:00.000Z' }), status: status() }
      )
    })
    expect(rows.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('names a known session by its title, its workspace by the deepest folder holding cwd, and its account by configDir', () => {
    const [row] = model3dJobRows({
      ...INPUT,
      view: view({ request: req('a', { sessionId: 'pane-1', cwd: 'c:\\SRC\\game\\art', configDir: 'C:/Users/me/.claude-work/' }), status: status() })
    })
    expect(row).toMatchObject({ session: 'Make the axe', workspace: 'game', account: 'Work' })
  })

  it('reads "Outside the app · <cwd folder>" for an unknown session, the default account for an empty configDir, and no workspace outside them all', () => {
    const [row] = model3dJobRows({ ...INPUT, view: view({ request: req('a', { sessionId: 'pane-9', cwd: 'D:\\art\\props\\' }), status: status() }) })
    expect(row).toMatchObject({ session: 'Outside the app · props', workspace: null, account: 'Personal' })
  })

  it('shows an unknown configDir as its folder', () => {
    const [row] = model3dJobRows({ ...INPUT, view: view({ request: req('a', { configDir: 'D:\\accounts\\other' }), status: status() }) })
    expect(row.account).toBe('D:\\accounts\\other')
  })

  it('reads progress as item i of n, its name, stage and sampling step', () => {
    const progress = { item: 2, of: 3, name: 'axe', stage: 'generate' as const, step: 7, steps: 30 }
    const [row] = model3dJobRows({ ...INPUT, view: view({ request: req('a'), status: status({ state: 'running', progress }) }) })
    expect(row.progress).toBe('Item 2 of 3 · axe · generate · step 7/30')
    const [early] = model3dJobRows({
      ...INPUT,
      view: view({ request: req('a'), status: status({ state: 'running', progress: { ...progress, name: null, step: null, steps: null } }) })
    })
    expect(early.progress).toBe('Item 2 of 3 · generate')
  })

  it('labels each state, keeps a waiting reason and a failed error line', () => {
    const rows = model3dJobRows({
      ...INPUT,
      view: view(
        { request: req('q', { submittedAt: '2026-11-28T10:00:05.000Z' }), status: status({ waitReason: 'Waiting: Unity running' }) },
        { request: req('f'), status: status({ state: 'failed', error: 'FAILED: out of memory' }) }
      )
    })
    expect(rows.map((r) => [r.stateLabel, r.waitReason, r.error])).toEqual([
      ['Queued', 'Waiting: Unity running', null],
      ['Failed', null, 'FAILED: out of memory']
    ])
  })
})

describe('a job duration', () => {
  const at = (iso: string): number => Date.parse(iso)
  it('counts a queued job from submittedAt, a running one from startedAt, and a finished one from start to end', () => {
    const now = at('2026-11-28T10:05:00.000Z')
    const rows = model3dJobRows({
      ...INPUT,
      view: view(
        { request: req('q'), status: status() },
        { request: req('r'), status: status({ state: 'running', startedAt: '2026-11-28T10:04:30.000Z' }) },
        { request: req('d'), status: status({ state: 'done', startedAt: '2026-11-28T10:01:00.000Z', endedAt: '2026-11-28T10:03:05.000Z' }) },
        { request: req('c'), status: status({ state: 'cancelled', endedAt: '2026-11-28T10:00:20.000Z' }) }
      )
    })
    const byId = Object.fromEntries(rows.map((r) => [r.id, jobDuration(r, now)]))
    expect(byId).toEqual({ q: 300_000, r: 30_000, d: 125_000, c: 20_000 })
  })
})
