import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MODEL3D_APP_SESSION, type Model3dJob, type Model3dRequest, type Model3dStatus } from '../../shared/model3d'
import { MODEL3D_DIGEST_MODELS, digestModel3d, type DigestModel3dInput } from './digestModel3d'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-digest3d-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const at = (minute: number): string => new Date(Date.UTC(2026, 10, 28, 10, minute)).toISOString()

const job = (id: string, request: Partial<Model3dRequest>, status: Partial<Model3dStatus>): Model3dJob => ({
  request: {
    id,
    kind: 'generate',
    argv: [],
    cwd: join(root, 'game'),
    python: 'python',
    script: 'gen3d.py',
    waiterPid: 1,
    wait: true,
    sessionId: '',
    configDir: '',
    submittedAt: at(0),
    summary: `${id}.png · prop`,
    runAnyway: false,
    ...request
  },
  status: { state: 'queued', waitReason: null, progress: null, startedAt: null, endedAt: null, error: null, outputs: [], ...status }
})

const input = (...jobs: Model3dJob[]): DigestModel3dInput => ({
  view: { server: 'ready', startedByApp: true, jobs },
  features: [{ sessionId: 'pane-f', name: 'dark-mode' }],
  hosted: [{ paneId: 'pane-h', cwd: join(root, 'tools') }],
  workspaces: [{ name: 'game', path: join(root, 'game') }]
})

const glb = (name: string, tris?: number): string => {
  const dir = join(root, 'game', 'out')
  mkdirSync(dir, { recursive: true })
  if (tris !== undefined) writeFileSync(join(dir, `${name}.json`), JSON.stringify({ tris, preset: 'prop' }))
  return join(dir, `${name}.glb`)
}

describe('the digest facts of the 3D service', () => {
  it('lists queued and running jobs oldest first, each with its session and its wait reason or state, never its progress', async () => {
    const { jobs } = await digestModel3d(
      input(
        job('running', { sessionId: 'pane-f', submittedAt: at(1) }, { state: 'running', progress: { item: 1, of: 2, name: 'axe', stage: 'generate', step: 3, steps: 10 } }),
        job('waiting', { sessionId: 'pane-h', submittedAt: at(2) }, { waitReason: 'Waiting: Darkfall cluster running' }),
        job('next', { submittedAt: at(3) }, {}),
        job('editor', { kind: 'editor', sessionId: MODEL3D_APP_SESSION, submittedAt: at(4) }, { state: 'running' })
      )
    )
    expect(jobs).toEqual([
      { summary: 'running.png · prop', session: 'dark-mode', state: 'Running' },
      { summary: 'waiting.png · prop', session: 'A session in tools', state: 'Waiting: Darkfall cluster running' },
      { summary: 'next.png · prop', session: 'Outside the app · game', state: 'Queued' },
      { summary: 'Editor turn', session: 'Command Center', state: 'Held' }
    ])
  })

  it('lists every model a finished job wrote, newest finished first, with its workspace and the tris of its .json', async () => {
    const crate = glb('crate', 12000)
    const barrel = glb('barrel')
    const axe = glb('axe', 800)
    const { models } = await digestModel3d(
      input(
        job('one', { sessionId: 'pane-f' }, { state: 'done', endedAt: at(10), outputs: [{ glb: crate, json: crate.replace('.glb', '.json') }, { glb: barrel }] }),
        job('two', { cwd: join(root, 'elsewhere') }, { state: 'failed', endedAt: at(20), outputs: [{ glb: axe }] }),
        job('editor', { kind: 'editor', sessionId: MODEL3D_APP_SESSION }, { state: 'done', endedAt: at(30) })
      )
    )
    expect(models).toEqual([
      { name: 'axe', glb: axe, session: 'Outside the app · elsewhere', workspace: null, tris: 800, finishedAt: Date.parse(at(20)) },
      { name: 'crate', glb: crate, session: 'dark-mode', workspace: 'game', tris: 12000, finishedAt: Date.parse(at(10)) },
      { name: 'barrel', glb: barrel, session: 'dark-mode', workspace: 'game', tris: null, finishedAt: Date.parse(at(10)) }
    ])
  })

  it(`keeps only the last ${MODEL3D_DIGEST_MODELS} finished models`, async () => {
    const jobs = Array.from({ length: 12 }, (_, i) => job(`m${i}`, {}, { state: 'done', endedAt: at(i), outputs: [{ glb: join(root, `m${i}.glb`) }] }))
    const { models } = await digestModel3d(input(...jobs))
    expect(models.map((m) => m.name)).toEqual(['m11', 'm10', 'm9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2'])
  })
})
