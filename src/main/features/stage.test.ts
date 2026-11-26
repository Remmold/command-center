import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nodeFileReader } from '../board/nodeFileReader'
import type { FeatureRecord } from '../../shared/features'
import { readFeatureStage } from './stage'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-stage-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const record = (name: string, completedAt: number | null = null): FeatureRecord => ({
  name,
  workspaceId: 'w',
  worktreePath: join(root, 'wt', name),
  branch: `feat/${name}`,
  sessionId: 's',
  ports: [],
  startedAt: 1,
  completedAt
})
const write = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}
const read = (r: FeatureRecord) => readFeatureStage(r, { files: nodeFileReader, testFlowsFolder: join(root, 'flows'), repoName: 'repo' })

describe('readFeatureStage', () => {
  it('says the worktree is missing when its folder is gone', async () => {
    expect(await read(record('gone'))).toEqual({ missing: true })
  })

  it('is Grilling for a worktree with no feature folder yet', async () => {
    mkdirSync(record('a').worktreePath, { recursive: true })
    expect(await read(record('a'))).toEqual({ missing: false, stage: 'Grilling', done: 0, total: 0 })
  })

  it('reads tickets from the feature folder: one done, one in progress, one waiting', async () => {
    const r = record('b')
    const issues = join(r.worktreePath, '.scratch', 'b', 'issues')
    write(join(r.worktreePath, '.scratch', 'b', 'spec.md'), '# spec')
    write(join(issues, '01-a.md'), '# 01: a\n\n**Status:** resolved\n')
    write(join(issues, '02-b.md'), '# 02: b\n\n**Status:** in-progress\n')
    write(join(issues, '03-c.md'), '# 03: c\n\n**Status:** ready-for-agent\n')
    expect(await read(r)).toEqual({ missing: false, stage: 'Building', done: 1, total: 3 })
  })

  it('is Testing once the feature has a test steps file in the repo folder of the test flows', async () => {
    const r = record('c')
    write(join(r.worktreePath, '.scratch', 'c', 'spec.md'), '# spec')
    write(join(root, 'flows', 'repo', 'c.md'), '- [ ] step')
    expect((await read(r)) as object).toMatchObject({ stage: 'Testing' })
  })

  it('is Completed for a completed record', async () => {
    mkdirSync(record('d').worktreePath, { recursive: true })
    expect((await read(record('d', 5))) as object).toMatchObject({ stage: 'Completed' })
  })
})
