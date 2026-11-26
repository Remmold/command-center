import type { StepCounter } from './testSteps'
import { wordColumn } from './ticketWords'

export type FeatureStage = 'Grilling' | 'Spec' | 'Tickets' | 'Building' | 'Testing' | 'Completed'

/** What a feature's files say; the stage is derived from this each time, never stored. */
export interface FeatureFacts {
  spec: boolean
  tickets: ReadonlyArray<{ status: string | null; hasProgress: boolean }>
  testSteps: boolean
  completed: boolean
}

export interface FeatureStageResult {
  stage: FeatureStage
  done: number
  total: number
}

/** A feature as the Features group shows it: its stage and tickets, its test steps' counter once a checklist exists, or that its worktree folder is gone. */
export type FeatureStageView = ({ missing: false; tests?: StepCounter } & FeatureStageResult) | { missing: true }

export function featureStage(facts: FeatureFacts): FeatureStageResult {
  const columns = facts.tickets.map((t) => wordColumn(t.status))
  const done = columns.filter((c) => c === 'done').length
  const started = facts.tickets.some((t, i) => columns[i] === 'done' || columns[i] === 'in-progress' || t.hasProgress)
  const total = facts.tickets.length
  const stage: FeatureStage = facts.completed
    ? 'Completed'
    : facts.testSteps
      ? 'Testing'
      : started
        ? 'Building'
        : total > 0
          ? 'Tickets'
          : facts.spec
            ? 'Spec'
            : 'Grilling'
  return { stage, done, total }
}
