import { beforeEach, describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import type { FeatureServersView } from '../../shared/featureServers'
import type { PreviewConfig } from '../../shared/previewConfig'
import { testFeature, type PairSpec, type TestPairDeps } from './testPair'

const config: PreviewConfig = {
  install: '',
  startPage: '/login',
  servers: [
    { name: 'web', command: 'x', cwd: '.', ready: 'port' },
    { name: 'api', command: 'y', cwd: '.', ready: 'port' }
  ]
}

let feature: FeatureRecord
let currentConfig: PreviewConfig | null
let view: FeatureServersView
let opened: PairSpec[]
let started: string[]

const deps = (): TestPairDeps => ({
  feature: async (name) => (name === feature.name ? feature : undefined),
  config: async () => currentConfig,
  runner: {
    start: async (name) => {
      started.push(name)
      return { ok: true }
    },
    settled: async () => view
  },
  flowFocus: async (f) => ({ picks: [], folder: 'C:/flows', repoName: 'app', title: f.name, checklist: `C:/flows/app/${f.name}.md` }),
  open: (spec) => void opened.push(spec)
})

const server = (name: string, port: number, status: FeatureServersView['servers'][number]['status']) => ({ name, port, status, terminalId: name })

beforeEach(() => {
  feature = { name: 'login', workspaceId: 'w', worktreePath: 'C:/wt', branch: 'b', sessionId: 's', ports: [4100, 4101], portNames: ['web', 'api'], startedAt: 1, completedAt: null }
  currentConfig = config
  view = { servers: [server('web', 4100, 'ready'), server('api', 4101, 'ready')] }
  opened = []
  started = []
})

describe('Test button', () => {
  it('boots the servers and opens the pair on the start page of the first server once all are Ready', async () => {
    expect(await testFeature(deps(), 'login')).toEqual({ ok: true })
    expect(started).toEqual(['login'])
    expect(opened).toEqual([
      { feature: 'login', flow: expect.objectContaining({ checklist: 'C:/flows/app/login.md' }), preview: { url: 'http://localhost:4100/login', ports: [4100, 4101] } }
    ])
  })

  it('takes the first server of the config, even when the record keeps its ports in another order', async () => {
    feature = { ...feature, ports: [4101, 4100], portNames: ['api', 'web'] }
    await testFeature(deps(), 'login')
    expect(opened[0].preview?.url).toBe('http://localhost:4100/login')
  })

  it('opens nothing and names the failed server when one Failed', async () => {
    view = { servers: [server('web', 4100, 'ready'), { ...server('api', 4101, 'failed'), reason: 'boom' }] }
    expect(await testFeature(deps(), 'login')).toEqual({ ok: false, error: expect.stringMatching(/api failed to start.*Retry/) })
    expect(opened).toEqual([])
  })

  it('opens nothing when the servers were stopped meanwhile', async () => {
    view = { servers: [server('web', 4100, 'stopped'), server('api', 4101, 'ready')] }
    expect(await testFeature(deps(), 'login')).toEqual({ ok: false, error: expect.stringMatching(/stopped/) })
    expect(opened).toEqual([])
  })

  it('opens only the test flow when the workspace has no preview config, and boots nothing', async () => {
    currentConfig = null
    expect(await testFeature(deps(), 'login')).toEqual({ ok: true })
    expect(started).toEqual([])
    expect(opened).toEqual([{ feature: 'login', flow: expect.anything(), preview: null }])
  })

  it('passes a refusal from the runner on', async () => {
    const d = deps()
    d.runner.start = async () => ({ ok: false, error: 'workspace removed' })
    expect(await testFeature(d, 'login')).toEqual({ ok: false, error: 'workspace removed' })
    expect(opened).toEqual([])
  })

  it('refuses an unknown or completed feature', async () => {
    expect((await testFeature(deps(), 'ghost')).ok).toBe(false)
    feature = { ...feature, completedAt: 9 }
    expect(await testFeature(deps(), 'login')).toEqual({ ok: false, error: expect.stringMatching(/completed/) })
  })
})
