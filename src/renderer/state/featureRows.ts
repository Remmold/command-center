import type { FeatureStageView } from '../../shared/featureStage'
import type { FeatureRecord } from '../../shared/features'
import type { AccountProfile, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'

export interface FeatureRow {
  name: string
  sessionId: string
  workspace: Workspace | undefined
  status: SessionStatus
  /** The feature's account as its profile is named now; null when the profile was removed. */
  accountName: string | null
  /** Undefined until the stage has been read. */
  stage: FeatureStageView | undefined
}

function rowsOf(
  features: readonly FeatureRecord[],
  workspaces: readonly Workspace[],
  profiles: ReadonlyArray<Pick<AccountProfile, 'id' | 'name'>>,
  statuses: Readonly<Record<string, SessionStatusEntry>>,
  stages: Readonly<Record<string, FeatureStageView>>
): FeatureRow[] {
  return features.map((f) => {
    const workspace = workspaces.find((w) => w.id === f.workspaceId)
    const profile = workspace && profiles.find((p) => p.id === workspace.profileId)
    return {
      name: f.name,
      sessionId: f.sessionId,
      workspace,
      status: statuses[f.sessionId]?.status ?? 'idle',
      accountName: profile?.name ?? null,
      stage: stages[f.name]
    }
  })
}

/** A feature's rows for the Features group; a missing workspace or profile never drops the row. */
export function featureRows(
  features: readonly FeatureRecord[],
  workspaces: readonly Workspace[],
  profiles: ReadonlyArray<Pick<AccountProfile, 'id' | 'name'>>,
  statuses: Readonly<Record<string, SessionStatusEntry>>,
  stages: Readonly<Record<string, FeatureStageView>>
): FeatureRow[] {
  return rowsOf(features.filter((f) => f.completedAt === null), workspaces, profiles, statuses, stages)
}

/** The rows of the Completed group. */
export function completedFeatureRows(
  features: readonly FeatureRecord[],
  workspaces: readonly Workspace[],
  profiles: ReadonlyArray<Pick<AccountProfile, 'id' | 'name'>>,
  statuses: Readonly<Record<string, SessionStatusEntry>>,
  stages: Readonly<Record<string, FeatureStageView>>
): FeatureRow[] {
  return rowsOf(features.filter((f) => f.completedAt !== null), workspaces, profiles, statuses, stages)
}

/** The text after the feature's name: its account, or a plain note when the account is gone. */
export function accountNote(row: Pick<FeatureRow, 'accountName' | 'workspace'>): string {
  if (!row.workspace) return 'workspace removed'
  return row.accountName ?? 'account removed'
}

/** The stage with tickets done out of total; a plain note when the worktree folder is gone; empty before it is read. */
export function stageNote(row: Pick<FeatureRow, 'stage'>): string {
  const { stage } = row
  if (!stage) return ''
  if (stage.missing) return 'worktree missing'
  return stage.total > 0 ? `${stage.stage} · ${stage.done}/${stage.total}` : stage.stage
}
