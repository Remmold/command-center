import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FeatureStageView } from '../../shared/featureStage'
import type { FeatureRecord } from '../../shared/features'
import { createStageService } from './stageService'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-stagesvc-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const record = (name: string, worktreePath: string): FeatureRecord => ({
  name, workspaceId: 'w', worktreePath, branch: name, sessionId: `s-${name}`, ports: [], startedAt: 1, completedAt: null
})

describe('stage service', () => {
  it('reads each feature from its files and never lets a gone worktree break the others', async () => {
    const wt = join(root, 'wt')
    mkdirSync(join(wt, '.scratch', 'a'), { recursive: true })
    writeFileSync(join(wt, '.scratch', 'a', 'spec.md'), '# spec')
    const service = createStageService({
      listFeatures: async () => [record('a', wt), record('gone', join(root, 'nope'))],
      listWorkspaces: async () => [],
      testFlowsFolder: async () => join(root, 'flows'),
      push: () => undefined
    })
    const stages = await service.current()
    service.stop()
    expect(stages.a).toMatchObject({ missing: false, stage: 'Spec' })
    expect(stages.gone).toEqual({ missing: true })
  })

  it('pushes again after a file changed, and not when nothing changed', async () => {
    const wt = join(root, 'wt')
    mkdirSync(join(wt, '.scratch', 'a'), { recursive: true })
    const pushed: Record<string, FeatureStageView>[] = []
    const service = createStageService({
      listFeatures: async () => [record('a', wt)],
      listWorkspaces: async () => [],
      testFlowsFolder: async () => join(root, 'flows'),
      push: (s) => pushed.push(s)
    })
    await service.current()
    await service.current()
    writeFileSync(join(wt, '.scratch', 'a', 'spec.md'), '# spec')
    await service.current()
    service.stop()
    expect(pushed.map((s) => (s.a as { stage: string }).stage)).toEqual(['Grilling', 'Spec'])
  })
})
