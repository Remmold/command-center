import { join } from 'node:path'
import type { FeatureRecord } from '../../shared/features'
import { featureStage, type FeatureStageView } from '../../shared/featureStage'
import { readTickets, type BoardFileReader } from '../board/reader'

export interface StageSources {
  files: BoardFileReader
  testFlowsFolder: string
  /** The repo's subfolder in the test flows folder, where the feature's test steps are written. */
  repoName: string
}

/** True when the worktree folder is there; an empty listing and a missing folder look the same, so ask for its own file. */
async function folderExists(path: string, files: BoardFileReader): Promise<boolean> {
  return (await files.modifiedAt(path)) !== null
}

/** Reads a feature's files and derives its stage; a gone worktree folder is `missing`, never an error. */
export async function readFeatureStage(record: FeatureRecord, { files, testFlowsFolder, repoName }: StageSources): Promise<FeatureStageView> {
  if (!(await folderExists(record.worktreePath, files))) return { missing: true }
  const dir = join(record.worktreePath, '.scratch', record.name)
  const tickets = await readTickets(join(dir, 'issues'), files)
  const spec = (await files.modifiedAt(join(dir, 'spec.md'))) !== null
  const stepsDir = join(testFlowsFolder, repoName)
  const testSteps = (await Promise.all(['.md', '.html'].map((ext) => files.modifiedAt(join(stepsDir, `${record.name}${ext}`))))).some((t) => t !== null)
  const result = featureStage({
    spec,
    tickets: tickets.map((t) => ({ status: t.status.status, hasProgress: t.progressPath !== null })),
    testSteps,
    completed: record.completedAt !== null
  })
  return { missing: false, ...result }
}
