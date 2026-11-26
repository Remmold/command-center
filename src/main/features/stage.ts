import { join } from 'node:path'
import type { FeatureRecord } from '../../shared/features'
import { featureStage, type FeatureStageView } from '../../shared/featureStage'
import { buildStepsView, resultsPathFor } from '../../shared/testSteps'
import { readTickets, type BoardFileReader } from '../board/reader'

export interface StageSources {
  files: BoardFileReader
  testFlowsFolder: string
  /** The repo's subfolder in the test flows folder, where the feature's test steps are written. */
  repoName: string
}

/** An empty folder listing looks like a missing folder, so ask for the path's own modified time. */
async function exists(path: string, files: BoardFileReader): Promise<boolean> {
  return (await files.modifiedAt(path)) !== null
}

/** A gone worktree folder is `missing`, never an error. */
export async function readFeatureStage(record: FeatureRecord, { files, testFlowsFolder, repoName }: StageSources): Promise<FeatureStageView> {
  if (!(await exists(record.worktreePath, files))) return { missing: true }
  const dir = join(record.worktreePath, '.scratch', record.name)
  const tickets = await readTickets(join(dir, 'issues'), files)
  const spec = await exists(join(dir, 'spec.md'), files)
  const stepsDir = join(testFlowsFolder, repoName)
  const checklistPath = join(stepsDir, `${record.name}.md`)
  const checklist = await files.readFile(checklistPath)
  const testSteps = checklist !== null || (await exists(join(stepsDir, `${record.name}.html`), files))
  const steps = checklist === null ? null : buildStepsView(record.name, checklist, await files.readFile(resultsPathFor(checklistPath)))
  const result = featureStage({
    spec,
    tickets: tickets.map((t) => ({ status: t.status.status, hasProgress: t.progressPath !== null })),
    testSteps,
    completed: record.completedAt !== null
  })
  return steps?.found ? { missing: false, ...result, tests: steps.counter } : { missing: false, ...result }
}
