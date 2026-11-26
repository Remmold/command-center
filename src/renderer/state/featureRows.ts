import type { FeatureRecord } from '../../shared/features'
import type { AccountProfile, SessionStatus, SessionStatusEntry, Workspace } from '../../shared/types'

export interface FeatureRow {
  name: string
  sessionId: string
  workspace: Workspace | undefined
  status: SessionStatus
  /** The feature's account as its profile is named now; null when the profile was removed. */
  accountName: string | null
}

/** A feature's rows for the Features group; a missing workspace or profile never drops the row. */
export function featureRows(
  features: readonly FeatureRecord[],
  workspaces: readonly Workspace[],
  profiles: ReadonlyArray<Pick<AccountProfile, 'id' | 'name'>>,
  statuses: Readonly<Record<string, SessionStatusEntry>>
): FeatureRow[] {
  return features
    .filter((f) => f.completedAt === null)
    .map((f) => {
      const workspace = workspaces.find((w) => w.id === f.workspaceId)
      const profile = workspace && profiles.find((p) => p.id === workspace.profileId)
      return {
        name: f.name,
        sessionId: f.sessionId,
        workspace,
        status: statuses[f.sessionId]?.status ?? 'idle',
        accountName: profile?.name ?? null
      }
    })
}

/** The text after the feature's name: its account, or a plain note when the account is gone. */
export function accountNote(row: Pick<FeatureRow, 'accountName'>): string {
  return row.accountName ?? 'account removed'
}
