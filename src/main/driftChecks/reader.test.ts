import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FindingsRun } from '../../shared/findings'
import { DriftChecksReader } from './reader'

let folder: string
let reader: DriftChecksReader

const WS = 'C:\\projects\\one'
const ACC = 'C:\\Users\\a\\.claude'

function run(runId: string, extra: Partial<FindingsRun> = {}): FindingsRun {
  return {
    version: 1,
    check: 'drift',
    scope: 'project',
    runId,
    sessionId: `s-${runId}`,
    startedAt: '2026-11-20T10:00:00.000Z',
    accountFolder: ACC,
    workspaces: [WS],
    steps: [],
    findings: [],
    done: false,
    ...extra
  }
}

const write = (name: string, content: string) => fs.writeFile(join(folder, name), content)

beforeEach(async () => {
  folder = await fs.mkdtemp(join(tmpdir(), 'cc-drift-checks-'))
  reader = new DriftChecksReader()
})

afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true })
})

describe('DriftChecksReader', () => {
  it('shows nothing and watches nothing when the folder is not there yet', async () => {
    expect(await reader.read(join(folder, 'missing'), WS, ACC)).toEqual({ view: { runs: [] }, watch: [] })
  })

  it('shows the newest run covering the workspace and watches its file while it is not done', async () => {
    await write('old.json', JSON.stringify(run('old', { startedAt: '2026-11-01T10:00:00.000Z', done: true })))
    await write('new.json', JSON.stringify(run('new')))
    const read = await reader.read(folder, WS, ACC)
    expect(read.view.runs.map((r) => [r.run.runId, r.writing, r.files])).toEqual([['new', false, 'all']])
    expect(read.watch.map((w) => w.path)).toEqual([join(folder, 'new.json')])
  })

  it('stops watching once the run reads done', async () => {
    await write('r.json', JSON.stringify(run('r', { done: true })))
    expect((await reader.read(folder, WS, ACC)).watch).toEqual([])
  })

  it('keeps the last good parse of a file being rewritten and says it is writing', async () => {
    await write('r.json', JSON.stringify(run('r', { steps: [{ id: 'a', title: 'A', status: 'running' }] })))
    await reader.read(folder, WS, ACC)
    await write('r.json', '{"version":1,"check":"drift","scope":"proj')
    const read = await reader.read(folder, WS, ACC)
    expect(read.view.runs.map((r) => [r.run.steps[0].status, r.writing])).toEqual([['running', true]])
    expect(read.watch).toHaveLength(1)
  })

  it('gives each finding file its modified time, null when it is gone', async () => {
    const file = join(folder, 'CLAUDE.md')
    await write('CLAUDE.md', '# rules')
    const finding = { verdict: 'stale', severity: 'problem', claim: '', evidence: '', fix: '', status: 'open' } as const
    await write('r.json', JSON.stringify(run('r', { findings: [{ ...finding, id: 'F1', path: file }, { ...finding, id: 'F2', path: join(folder, 'gone.md') }] })))
    const [shown] = (await reader.read(folder, WS, ACC)).view.runs
    const mtime = (await fs.stat(file)).mtimeMs
    expect(Object.values(shown.modified)).toEqual([mtime, null])
  })
})
